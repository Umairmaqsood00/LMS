# Simple LMS — Database Lab Project

React JS + Express JS + Microsoft SQL Server. Plain CSS, native fetch, and direct SQL queries. No ORM, UI framework, Redux, or extra services.

## Local Setup and Running

Requires Node.js (20.19+ or 22.12+), SQL Server / SQL Express, and Microsoft ODBC Driver 18 for SQL Server when using Windows authentication.

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
3. Configure `.env` with your SQL Server settings:
   - Set `DB_SERVER` to your SQL Server instance (e.g. `localhost\SQLEXPRESS` or `localhost`).
   - Windows authentication is enabled by default (`DB_WINDOWS_AUTH=true`) and uses the account running Node.
   - For SQL Server authentication, set `DB_WINDOWS_AUTH=false`, `DB_USER`, and `DB_PASSWORD`.
4. Run the database setup script once to create and seed `LMS_Project_DB`:
   ```powershell
   npm run db:setup
   ```
   *Note: The Windows/SQL login must have permission to create databases. Setup creates `LMS_Project_DB` with the original 17 tables, constraints, and sample data from the schema. It refuses to modify an existing database.*
   *Alternatively, create a new empty `LMS_Project_DB` database in SSMS and run `database/01-schema.sql`, then `database/02-objects.sql`. Do not run the schema script again on an initialized database. The second script can be rerun to update the two views and procedures.*
5. Build the frontend production assets:
   ```powershell
   npm run build
   ```
6. Start the server:
   ```powershell
   npm start
   ```
7. Open **http://localhost:3001** in your browser. Keep the terminal open. Press Ctrl+C in the terminal to stop the server.

Sample accounts from the schema:

| Role | Email | Password |
| --- | --- | --- |
| Teacher | ayesha.khan@lms.edu | ayesha@123 |
| Teacher | bilal.ahmed@lms.edu | bilal@123 |
| Student | ali.raza@student.lms.edu | ali@123 |
| Student | fatima.noor@student.lms.edu | fatima@123 |

Teachers see their own courses. Students can browse published courses and enroll. You can also register new teacher or student accounts.

Teachers do not enroll in their own courses. Browser tabs share the login cookie, so signing in as a student in another tab changes the active account for both tabs. The app refreshes the displayed account after login/logout in another tab and whenever you return to the page. To test teacher and student accounts simultaneously, use a separate browser profile or private window.

## Included functionality

- Teacher/student registration, login, logout, and profile/password changes.
- Teachers create and edit courses, add numbered video lessons and lesson materials.
- Students search courses, enroll, mark lessons completed, view progress, and drop courses.
- Teachers create quizzes with four options per question, time limits, marks, and passing marks.
- Students attempt quizzes with a timer and receive automatic SQL-calculated results.
- Teachers create assignments, download submissions, and give marks and feedback.
- Students upload one submission per assignment and view grades. Late work is accepted and labeled, matching the sample dataset.
- Teachers post/delete announcements. Enrolled students read them.
- Reports show enrollment, student lesson progress, and quiz results.

## Exactly two database views

| View | Purpose | Used by |
| --- | --- | --- |
| `dbo.vw_CourseEnrollment` | Course, teacher, category, enrollment count, completion count | Course list and teacher reports |
| `dbo.vw_StudentProgress` | Total/completed lessons and progress percentage per enrolled student/course | Student progress and teacher reports |

The views use LEFT JOINs to include courses without students or lessons. Progress uses NULLIF/COALESCE to handle division by zero.

## Exactly two stored procedures

| Procedure | Purpose | Used by |
| --- | --- | --- |
| `dbo.sp_EnrollStudent` | Validates student/course and prevents duplicate enrollment | Enroll button |
| `dbo.sp_SubmitQuiz` | Validates attempt/answers/time, saves answers, calculates score | Submit quiz button |

Both procedures use transactions. Quiz answers are sent as a JSON array and read using SQL Server's OPENJSON. Correct options stay on the server. The quiz timer uses the attempt start time in SQL Server and allows 15 seconds for delivery after the timer ends. Starting again during an active attempt reuses that attempt. Retakes are allowed.

## Code map and explanation

| File/folder | Responsibility |
| --- | --- |
| `client/main.jsx` | Login state and simple page navigation |
| `client/pages/` | React forms and teacher/student pages |
| `client/api.js` | Fetch requests to Express |
| `client/style.css` | Minimal responsive plain CSS |
| `server/index.js` | Express routes, authorization, uploads, and SQL operations |
| `server/db.js` | SQL Server connection, parameterized queries, transactions |
| `server/auth.js` | Password hashing and cookie sessions |
| `server/validation.js` | Small input validation helpers |
| `database/01-schema.sql` | Your LMS tables and seed data |
| `database/02-objects.sql` | The two views and two stored procedures |
| `scripts/setup-db.js` | Runs SQL batches separated by GO |
| `tests/integration.test.js` | Integration checks against SQL Server |

Example flow: clicking Enroll calls `client/api.js`, which sends POST `/api/courses/:cid/enroll`. Express verifies the student session and executes `sp_EnrollStudent` with parameters. SQL Server inserts the enrollment, then React reloads the course list.

New passwords use Node's built-in salted scrypt. The supplied sample SHA-256 passwords remain compatible. Sessions are random tokens in HttpOnly cookies, expire after eight hours, and are held in memory to keep this local lab app simple. Restarting Express logs everyone out. SQL values are parameterized, and routes check roles, course ownership, or enrollment.

## Files and sample data

The supplied SQL includes paths to videos, notes, and submissions, but the actual files were not supplied. Those sample links cannot open until real files exist. To demonstrate uploads, create a new course, upload a video or notes as a teacher, then enroll a student and submit an assignment. Uploaded files are stored in `uploads/`, while paths are stored in SQL Server. Downloads require a valid session and course access. Maximum file size is 100 MB. Supported formats: MP4, WebM, PDF, TXT, DOCX, PPTX, CPP, C, JAVA, PY, and SQL.

Marking all existing lessons completed marks the course completed; adding a lesson resets that status. Dropping a course removes that student's progress, quiz attempts, and submissions for the course. This is a local lab demonstration, using one Node process and local file storage.

## Development and verification

Run the backend and frontend in separate terminals:

```powershell
npm run server
```

```powershell
npm run dev
```

Open the Vite address printed in the dev terminal. Its `/api` proxy forwards requests to Express on port 3001. Rebuild with `npm run build` before running the production version after frontend changes.

To run the integration tests against SQL Server:

```powershell
npm test
```

Integration tests create temporary users/courses in the configured database and remove them afterward. They check login, teacher access without enrollment, roles/ownership, enrollment/duplicates, files/progress, quiz scoring/timing, submissions/grading, announcements/reports, profile changes, and dropping a course.

If SQL connection fails, check the SQL Server service, instance name, ODBC driver, and `.env`. If the database already exists, start the app directly instead of running setup again.
