import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Table, Message } from '../components';

export default function Reports({ user }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const teacher = user.Role === 'Teacher';
  useEffect(() => { api(teacher ? '/reports' : '/progress').then(setData).catch(e => setError(e.message)); }, []);
  const progressColumns = [['Title', 'Course'], ...(teacher ? [['FullName', 'Student']] : []), ['CompletedLessons', 'Completed lessons'], ['TotalLessons', 'Total lessons'], ['ProgressPercent', 'Progress', row => <><progress max="100" value={row.ProgressPercent}/><span> {row.ProgressPercent}%</span></>]];
  return <><h1>{teacher ? 'Course reports' : 'My progress'}</h1><Message error={error}/>{data ? <>
    {teacher && <section className="panel"><h2>Enrollment overview</h2><Table rows={data.courses} columns={[[ 'Title', 'Course'], ['EnrolledStudents', 'Enrolled'], ['CompletedStudents', 'Completed']]} /></section>}
    <section className="panel"><h2>Lesson progress</h2><Table rows={teacher ? data.progress : data} columns={progressColumns}/></section>
    {teacher && <section className="panel"><h2>Quiz results</h2><Table rows={data.quizzes} columns={[[ 'Course', 'Course'], ['Quiz', 'Quiz'], ['FullName', 'Student'], ['Score', 'Score'], ['TotalMarks', 'Out of']]} /></section>}
  </> : !error && <p>Loading…</p>}</>;
}
