import React, { useEffect, useState } from 'react';
import { api, fileUrl, date } from '../api';
import { Field, Form, Message, Empty, Table } from '../components';
import { CourseFields } from './Courses';
import Quiz, { QuizForm } from './Quiz';

export default function Course({ course, user, back }) {
  const [data, setData] = useState(null), [tab, setTab] = useState('Lessons'), [error, setError] = useState('');
  const [submissions, setSubmissions] = useState([]), [quiz, setQuiz] = useState(null), [categories, setCategories] = useState([]);
  const [title, setTitle] = useState(course.Title), [working, setWorking] = useState(false), [videoError, setVideoError] = useState({});
  const teacher = user.Role === 'Teacher', cid = course.CourseID;
  async function refresh() {
    const content = await api(`/courses/${cid}/content`); setData(content);
    if (teacher) setSubmissions(await api(`/courses/${cid}/submissions`));
  }
  useEffect(() => { refresh().catch(e => setError(e.message)); if (teacher) api('/categories').then(setCategories).catch(e => setError(e.message)); }, []);
  async function action(work) { setError(''); setWorking(true); try { await work(); await refresh(); } catch (e) { setError(e.message); } finally { setWorking(false); } }
  async function add(endpoint, body) { const result = await api(endpoint, { method: 'POST', body }); await refresh(); return result; }
  if (quiz) return <Quiz quiz={quiz} done={() => { setQuiz(null); refresh().catch(e => setError(e.message)); }} />;
  return <><button className="link" onClick={back}>← Back to courses</button><h1>{title}</h1><p className="muted">{course.TeacherName} · {course.CategoryName}</p><Message error={error}/>
    <div className="tabs">{['Lessons', 'Assignments', 'Quizzes', 'Announcements', ...(teacher ? ['Settings'] : [])].map(t => <button className={tab === t ? 'active' : 'secondary'} key={t} onClick={() => setTab(t)}>{t}</button>)}</div>
    {!data && !error && <p>Loading course…</p>}
    {data && tab === 'Lessons' && <>
      {teacher && <details className="panel"><summary>Add a lesson</summary><Form label="Add lesson" multipart onSubmit={body => add(`/courses/${cid}/lessons`, body)}>
        <Field label="Title" name="Title" maxLength={150} required /><div className="row"><Field label="Lesson number" name="LessonNo" type="number" min={1} required /><Field label="Duration (minutes, optional)" name="DurationMin" type="number" min={1} /></div><Field label="Video (MP4 or WebM, optional; max 100 MB)" name="file" type="file" accept=".mp4,.webm"/>
      </Form></details>}
      {!data.lessons.length && <Empty>No lessons yet.</Empty>}
      {data.lessons.map(l => <section className="panel" key={l.LessonID}><h2>{l.LessonNo}. {l.Title}</h2><p className="muted">{l.DurationMin ? `${l.DurationMin} minutes` : 'Duration not set'}{l.Completed ? ' · Completed' : ''}</p>
        {l.VideoPath && <><video controls preload="none" src={fileUrl(l.VideoPath)} onError={() => setVideoError(v => ({ ...v, [l.LessonID]: true }))}/>{videoError[l.LessonID] && <p className="muted">Video file unavailable. Sample SQL paths do not include actual files.</p>}</>}
        <div className="materials">{data.materials.filter(m => m.LessonID === l.LessonID).map(m => <p key={m.MaterialID}><a href={fileUrl(m.FilePath)} target="_blank" rel="noreferrer">{m.Title}</a></p>)}</div>
        {!teacher && <button disabled={l.Completed || working} onClick={() => action(() => api(`/lessons/${l.LessonID}/complete`, { method: 'POST' }))}>{l.Completed ? 'Completed' : 'Mark as completed'}</button>}
        {teacher && <details><summary>Add notes or material</summary><Form label="Upload material" multipart onSubmit={body => add(`/lessons/${l.LessonID}/materials`, body)}><Field label="Material title" name="Title" maxLength={150} required /><Field label="File (max 100 MB)" name="file" type="file" accept=".pdf,.txt,.docx,.pptx,.cpp,.c,.java,.py,.sql" required /></Form></details>}
      </section>)}
      {!teacher && <details className="panel"><summary>Drop this course</summary><p>This removes your lesson progress, assignment submissions, and quiz attempts in this course.</p><button className="danger" disabled={working} onClick={() => action(async () => { await api(`/courses/${cid}/enroll`, { method: 'DELETE' }); back(); })}>Drop course</button></details>}
    </>}
    {data && tab === 'Assignments' && <>
      {teacher && <details className="panel"><summary>Create assignment</summary><Form label="Create assignment" onSubmit={body => add(`/courses/${cid}/assignments`, { ...body, DueDate: new Date(body.DueDate).toISOString() })}>
        <Field label="Title" name="Title" maxLength={150} required /><Field label="Instructions"><textarea name="Instructions" maxLength={1000}/></Field><Field label="Due date" name="DueDate" type="datetime-local" required /><Field label="Total marks" name="TotalMarks" type="number" min={1} required />
      </Form></details>}
      {!data.assignments.length && <Empty>No assignments yet.</Empty>}
      {data.assignments.map(a => <section className="panel" key={a.AssignmentID}><h2>{a.Title}</h2><p className="prewrap">{a.Instructions}</p><p className="muted">Due: {date(a.DueDate)} · {a.TotalMarks} marks</p>
        {!teacher && (a.SubmissionID ? <><p><a href={fileUrl(a.FilePath)} target="_blank" rel="noreferrer">Your submission</a></p><p>{a.MarksObtained === null ? 'Awaiting grading' : `Marks: ${a.MarksObtained} / ${a.TotalMarks}`}</p>{a.Feedback && <p>Feedback: {a.Feedback}</p>}</> : <Form multipart label="Submit assignment" onSubmit={body => add(`/assignments/${a.AssignmentID}/submit`, body)}><Field label="Assignment file (max 100 MB)" name="file" type="file" accept=".pdf,.txt,.docx,.pptx,.cpp,.c,.java,.py,.sql" required/><p className="muted">One submission per assignment. Late submissions are labeled for your teacher.</p></Form>)}
      </section>)}
      {teacher && <><h2>Student submissions</h2>{!submissions.length && <Empty />}{submissions.map(s => <section className="panel" key={s.SubmissionID}><h3>{s.FullName} · {s.Title}</h3><p className="muted">Submitted: {date(s.SubmittedAt)} {s.IsLate ? ' · Late' : ' · On time'}</p><a href={fileUrl(s.FilePath)} target="_blank" rel="noreferrer">Open submission</a><Form label="Save grade" onSubmit={async body => { const result = await api(`/submissions/${s.SubmissionID}/grade`, { method: 'PUT', body }); await refresh(); return result; }}><Field label={`Marks (out of ${s.TotalMarks})`} name="MarksObtained" type="number" min={0} max={s.TotalMarks} defaultValue={s.MarksObtained ?? ''} required /><Field label="Feedback"><textarea name="Feedback" defaultValue={s.Feedback || ''} maxLength={500}/></Field></Form></section>)}</>}
    </>}
    {data && tab === 'Quizzes' && <>
      {teacher && <details className="panel"><summary>Create quiz</summary><QuizForm courseId={cid} refresh={refresh}/></details>}
      {!data.quizzes.length && <Empty>No quizzes yet.</Empty>}{data.quizzes.map(q => <section className="panel" key={q.QuizID}><h2>{q.Title}</h2><p>{q.TimeLimitMin} minutes · {q.TotalMarks || 0} marks · Pass: {q.PassingMarks}</p>{!teacher && <button disabled={working} onClick={() => action(async () => setQuiz(await api(`/quizzes/${q.QuizID}/start`, { method: 'POST' })))}>Start quiz</button>}</section>)}
      {!teacher && <section className="panel"><h2>My quiz results</h2><Table rows={data.results} columns={[[ 'QuizID', 'Quiz', row => data.quizzes.find(q => q.QuizID === row.QuizID)?.Title], ['Score', 'Marks'], ['PassingMarks', 'Passing marks'], ['SubmittedAt', 'Submitted', row => date(row.SubmittedAt)], ['status', 'Result', row => row.Score >= row.PassingMarks ? 'Passed' : 'Not passed']]} /></section>}
    </>}
    {data && tab === 'Announcements' && <>
      {teacher && <details className="panel"><summary>Post announcement</summary><Form label="Post announcement" onSubmit={body => add(`/courses/${cid}/announcements`, body)}><Field label="Title" name="Title" maxLength={150} required/><Field label="Message"><textarea name="Message" maxLength={1000} required /></Field></Form></details>}
      {!data.announcements.length && <Empty>No announcements yet.</Empty>}{data.announcements.map(a => <section className="panel" key={a.AnnouncementID}><h2>{a.Title}</h2><p className="muted">{date(a.PostedAt)}</p><p className="prewrap">{a.Message}</p>{teacher && <button className="secondary" disabled={working} onClick={() => action(() => api(`/announcements/${a.AnnouncementID}`, { method: 'DELETE' }))}>Delete</button>}</section>)}
    </>}
    {teacher && tab === 'Settings' && <section className="panel narrow"><h2>Edit course</h2><Form label="Save course" onSubmit={async body => { const result = await api(`/courses/${cid}`, { method: 'PUT', body }); setTitle(body.Title); return result; }}><CourseFields categories={categories} course={course}/></Form></section>}
  </>;
}
