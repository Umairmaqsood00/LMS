import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { unlink } from 'node:fs/promises';
import app from '../server/index.js';
import { connect, query } from '../server/db.js';

// Uses a real initialized SQL Server database. Only temporary test users/data are removed.
test('LMS teacher and student integration', async t => {
  const pool = await connect();
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const users = [], courses = [], files = [];
  let teacher, student, outsider, cid, lid, quizId, attemptId, questionId, assignmentId, submissionId;
  async function request(route, method = 'GET', body, cookie) {
    const response = await fetch(`${base}/api${route}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function register(Role) {
    const response = await request('/auth/register', 'POST', { FullName: `Test ${Role}`, Email: `test-${Role}-${crypto.randomUUID()}@lms.test`, Password: ' test-password ', Role });
    assert.equal(response.status, 201, JSON.stringify(response.data)); users.push(response.data.UserID); return response;
  }
  function form(values, fileName) {
    const data = new FormData(); for (const [key, value] of Object.entries(values)) data.append(key, value);
    if (fileName) data.append('file', new Blob(['LMS integration test file'], { type: 'text/plain' }), fileName); return data;
  }
  try {
    await t.test('requires login and accepts supplied SHA-256 sample login', async () => {
      assert.equal((await request('/courses')).status, 401);
      assert.equal((await request('/auth/login', 'POST', { Email: 'ali.raza@student.lms.edu', Password: 'ali@123' })).status, 200);
      teacher = await register('Teacher'); student = await register('Student'); outsider = await register('Teacher');
      assert.equal((await request('/auth/login', 'POST', { Email: teacher.data.Email, Password: ' test-password ' })).status, 200);
    });
    await t.test('sample teacher opens all own courses without student enrollment', async () => {
      const login = await request('/auth/login', 'POST', { Email: 'ayesha.khan@lms.edu', Password: 'ayesha@123' });
      assert.equal(login.status, 200);
      const list = await request('/courses', 'GET', null, login.cookie);
      assert.ok(list.data.length > 0);
      for (const course of list.data) {
        assert.equal(course.TeacherID, login.data.UserID);
        const content = await request(`/courses/${course.CourseID}/content`, 'GET', null, login.cookie);
        assert.equal(content.status, 200, JSON.stringify(content.data));
        assert.ok(Array.isArray(content.data.lessons));
        assert.equal((await request(`/courses/${course.CourseID}/submissions`, 'GET', null, login.cookie)).status, 200);
      }
    });
    await t.test('teacher creates course; roles and ownership are enforced', async () => {
      const categories = await request('/categories', 'GET', null, teacher.cookie);
      const body = { Title: 'Integration course', Description: 'Temporary', CategoryID: categories.data[0].CategoryID };
      assert.equal((await request('/courses', 'POST', body, student.cookie)).status, 403);
      const response = await request('/courses', 'POST', body, teacher.cookie); assert.equal(response.status, 201, JSON.stringify(response.data));
      cid = response.data.CourseID; courses.push(cid);
      assert.equal((await request(`/courses/${cid}/content`, 'GET', null, teacher.cookie)).status, 200);
      assert.equal((await request(`/courses/${cid}`, 'PUT', body, outsider.cookie)).status, 403);
      assert.equal((await request(`/courses/${cid}/content`, 'GET', null, student.cookie)).status, 403);
    });
    await t.test('enrollment stored procedure rejects duplicates and view includes zero lessons', async () => {
      assert.equal((await request(`/courses/${cid}/enroll`, 'POST', null, student.cookie)).status, 201);
      assert.equal((await request(`/courses/${cid}/enroll`, 'POST', null, student.cookie)).status, 400);
      const response = await request('/progress', 'GET', null, student.cookie);
      assert.equal(response.data[0].TotalLessons, 0); assert.equal(response.data[0].ProgressPercent, 0);
    });
    await t.test('lessons, protected materials, and progress persist in SQL', async () => {
      let response = await request(`/courses/${cid}/lessons`, 'POST', form({ Title: 'Lesson', LessonNo: 1 }), teacher.cookie);
      assert.equal(response.status, 201, JSON.stringify(response.data)); lid = response.data.LessonID;
      response = await request(`/lessons/${lid}/materials`, 'POST', form({ Title: 'Notes' }, 'notes.txt'), teacher.cookie); assert.equal(response.status, 201);
      const content = await request(`/courses/${cid}/content`, 'GET', null, student.cookie);
      const file = content.data.materials[0].FilePath; files.push(file);
      assert.equal((await request(`/files/${file.split('/').pop()}`)).status, 401);
      assert.equal((await request(`/files/${file.split('/').pop()}`, 'GET', null, student.cookie)).status, 200);
      assert.equal((await request(`/files/${file.split('/').pop()}`, 'GET', null, outsider.cookie)).status, 403);
      assert.equal((await request(`/lessons/${lid}/complete`, 'POST', null, student.cookie)).status, 200);
      assert.equal((await request(`/lessons/${lid}/complete`, 'POST', null, student.cookie)).status, 200);
      response = await request('/progress', 'GET', null, student.cookie); assert.equal(response.data[0].ProgressPercent, 100); assert.ok(response.data[0].CompletedAt);
    });
    await t.test('quiz procedure rejects foreign questions, computes marks and blocks resubmission', async () => {
      const body = { Title: 'Quiz', TimeLimitMin: 5, PassingMarks: 2, Questions: [{ QuestionText: '2+2?', Marks: 2, Options: ['3','4','5','6'], Correct: 'B' }] };
      let response = await request(`/courses/${cid}/quizzes`, 'POST', body, teacher.cookie); assert.equal(response.status, 201, JSON.stringify(response.data));
      const content = await request(`/courses/${cid}/content`, 'GET', null, student.cookie); quizId = content.data.quizzes[0].QuizID;
      response = await request(`/quizzes/${quizId}/start`, 'POST', null, student.cookie); assert.equal(response.status, 200);
      assert.ok(!JSON.stringify(response.data).includes('IsCorrect'));
      attemptId = response.data.AttemptID; questionId = response.data.questions[0].QuestionID;
      const resumed = await request(`/quizzes/${quizId}/start`, 'POST', null, student.cookie); assert.equal(resumed.data.AttemptID, attemptId);
      assert.equal((await request(`/attempts/${attemptId}/submit`, 'POST', { Answers: [{ QuestionID: 2147483647, OptionLabel: 'A' }] }, student.cookie)).status, 400);
      response = await request(`/attempts/${attemptId}/submit`, 'POST', { Score: 999, Answers: [{ QuestionID: questionId, OptionLabel: 'B' }] }, student.cookie);
      assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.Score, 2); assert.equal(response.data.Passed, true);
      assert.equal((await request(`/attempts/${attemptId}/submit`, 'POST', { Answers: [] }, student.cookie)).status, 400);
      const fresh = await request(`/quizzes/${quizId}/start`, 'POST', null, student.cookie);
      await query('UPDATE QuizAttempts SET StartedAt=DATEADD(HOUR,-2,SYSDATETIME()) WHERE AttemptID=@aid', { aid: fresh.data.AttemptID });
      assert.equal((await request(`/attempts/${fresh.data.AttemptID}/submit`, 'POST', { Answers: [] }, student.cookie)).status, 400);
    });
    await t.test('assignment upload, duplicate prevention, and bounded grading', async () => {
      let response = await request(`/courses/${cid}/assignments`, 'POST', { Title: 'Homework', Instructions: 'Submit text', DueDate: '2026-01-01T00:00:00Z', TotalMarks: 10 }, teacher.cookie); assert.equal(response.status, 201);
      const content = await request(`/courses/${cid}/content`, 'GET', null, student.cookie); assignmentId = content.data.assignments[0].AssignmentID;
      assert.equal((await request(`/assignments/${assignmentId}/submit`, 'POST', form({}, 'homework.txt'), student.cookie)).status, 201);
      assert.equal((await request(`/assignments/${assignmentId}/submit`, 'POST', form({}, 'duplicate.txt'), student.cookie)).status, 409);
      const submissions = await request(`/courses/${cid}/submissions`, 'GET', null, teacher.cookie);
      submissionId = submissions.data[0].SubmissionID; files.push(submissions.data[0].FilePath); assert.equal(submissions.data[0].IsLate, true);
      assert.equal((await request(`/submissions/${submissionId}/grade`, 'PUT', { MarksObtained: 11 }, teacher.cookie)).status, 400);
      assert.equal((await request(`/submissions/${submissionId}/grade`, 'PUT', { MarksObtained: 8 }, outsider.cookie)).status, 403);
      assert.equal((await request(`/submissions/${submissionId}/grade`, 'PUT', { MarksObtained: 0, Feedback: 'Please revise' }, teacher.cookie)).status, 200);
      response = await request(`/courses/${cid}/content`, 'GET', null, student.cookie); assert.equal(response.data.assignments[0].MarksObtained, 0);
    });
    await t.test('announcements, reports, profile update, and drop course', async () => {
      assert.equal((await request(`/courses/${cid}/announcements`, 'POST', { Title: 'Notice', Message: 'Hello' }, teacher.cookie)).status, 201);
      const reports = await request('/reports', 'GET', null, teacher.cookie); assert.equal(reports.data.courses[0].EnrolledStudents, 1); assert.equal(reports.data.quizzes[0].Score, 2);
      assert.equal((await request('/profile', 'PUT', { FullName: 'Updated student', Institution: 'Test college', CurrentPassword: ' test-password ', NewPassword: 'new-password' }, student.cookie)).status, 200);
      assert.equal((await request('/auth/login', 'POST', { Email: student.data.Email, Password: 'new-password' })).status, 200);
      assert.equal((await request(`/courses/${cid}/enroll`, 'DELETE', null, student.cookie)).status, 200);
      assert.equal((await request(`/courses/${cid}/content`, 'GET', null, student.cookie)).status, 403);
      assert.equal((await request('/progress', 'GET', null, student.cookie)).data.length, 0);
    });
  } finally {
    for (const courseId of courses) {
      await query('DELETE FROM QuizAttempts WHERE QuizID IN (SELECT QuizID FROM Quizzes WHERE CourseID=@cid)', { cid: courseId });
      await query('DELETE FROM Courses WHERE CourseID=@cid', { cid: courseId });
    }
    for (const uid of users) await query('DELETE FROM Users WHERE UserID=@uid', { uid });
    for (const file of files) await unlink(new URL(`../${file}`, import.meta.url)).catch(() => {});
    await new Promise(resolve => server.close(resolve)); await pool.close();
  }
});
