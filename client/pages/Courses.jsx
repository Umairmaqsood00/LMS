import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Field, Form, Message, Empty } from '../components';

export function CourseFields({ categories, course = {} }) {
  return <><Field label="Course title" name="Title" defaultValue={course.Title} maxLength={150} required />
    <Field label="Category"><select name="CategoryID" defaultValue={course.CategoryID} required>{categories.map(c => <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>)}</select></Field>
    <Field label="Description"><textarea name="Description" defaultValue={course.Description} maxLength={1000} /></Field></>;
}
export default function Courses({ user, open }) {
  const [courses, setCourses] = useState([]), [categories, setCategories] = useState([]), [search, setSearch] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(true), [enrolling, setEnrolling] = useState(null);
  async function load(keyword = '') { setCourses(await api(`/courses?search=${encodeURIComponent(keyword)}`)); }
  useEffect(() => { Promise.all([load(), api('/categories').then(setCategories)]).catch(e => setError(e.message)).finally(() => setBusy(false)); }, []);
  return <><h1>{user.Role === 'Teacher' ? 'My courses' : 'Explore courses'}</h1><p className="muted">{user.Role === 'Teacher' ? 'Manage lessons, assignments, and quizzes.' : 'Find a course and start learning.'}</p>
    {user.Role === 'Teacher' && <details className="panel"><summary>Create a course</summary><Form label="Create course" onSubmit={async body => { const result = await api('/courses', { method: 'POST', body }); await load(search); return result; }}><CourseFields categories={categories} /></Form></details>}
    <form className="search" onSubmit={e => { e.preventDefault(); load(search).catch(e => setError(e.message)); }}><input aria-label="Search courses" placeholder="Search course titles…" value={search} onChange={e => setSearch(e.target.value)} maxLength={150}/><button>Search</button></form>
    <Message error={error} />{busy ? <p>Loading courses…</p> : !courses.length ? <Empty>No courses found.</Empty> : <div className="cards">{courses.map(c => <article className="panel" key={c.CourseID}><span className="badge">{c.CategoryName}</span><h2>{c.Title}</h2><p>{c.Description || 'No description.'}</p><p className="muted">{c.TeacherName} · {c.EnrolledStudents} enrolled</p>
      {user.Role === 'Teacher' || c.Enrolled ? <button onClick={() => open(c)}>Open course</button> : <button disabled={enrolling === c.CourseID} onClick={async () => { setError(''); setEnrolling(c.CourseID); try { await api(`/courses/${c.CourseID}/enroll`, { method: 'POST' }); await load(search); } catch (e) { setError(e.message); } finally { setEnrolling(null); } }}>{enrolling === c.CourseID ? 'Enrolling…' : 'Enroll'}</button>}
    </article>)}</div>}
  </>;
}
