import express from "express";
import multer from "multer";
import path from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { connect, query, transaction, sql } from "./db.js";
import { fail, text, integer } from "./validation.js";
import {
  readSession,
  createSession,
  loginRequired,
  role,
  logout,
  hashPassword,
  verifyPassword,
  password,
} from "./auth.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const uploadDir = path.join(root, "uploads");
mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) =>
      cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      ".pdf",
      ".txt",
      ".docx",
      ".pptx",
      ".cpp",
      ".c",
      ".java",
      ".py",
      ".sql",
      ".mp4",
      ".webm",
    ];
    cb(
      allowed.includes(path.extname(file.originalname).toLowerCase())
        ? null
        : new Error("Unsupported file type."),
      allowed.includes(path.extname(file.originalname).toLowerCase()),
    );
  },
});
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));
app.use(readSession);
// Same-origin cookies and no CORS are sufficient for the local, single-server app.
app.use("/api", (req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  ) {
    return res.status(403).json({ message: "Cross-origin request rejected." });
  }
  next();
});
const teacher = role("Teacher");
const student = role("Student");
const id = (value) => integer(value, "ID");
const first = (result) => result.recordset[0];

async function ownCourse(req, courseId) {
  const course = first(
    await query("SELECT * FROM Courses WHERE CourseID=@cid", {
      cid: id(courseId),
    }),
  );
  if (!course) fail("Course not found.", 404);
  if (course.TeacherID !== req.user.UserID)
    fail("This course belongs to another teacher.", 403);
  return course;
}
async function accessCourse(req, courseId) {
  const cid = id(courseId);
  if (req.user.Role === "Teacher") return ownCourse(req, cid);
  const enrollment = first(
    await query(
      "SELECT * FROM Enrollments WHERE StudentID=@sid AND CourseID=@cid",
      { sid: req.user.UserID, cid },
    ),
  );
  if (!enrollment) fail("Enroll in this course first.", 403);
  return enrollment;
}
function filePath(req) {
  if (!req.file) fail("Choose a file.");
  return `uploads/${req.file.filename}`;
}

app.post("/api/auth/register", async (req, res) => {
  const name = text(req.body.FullName, "name", 100);
  const email = text(req.body.Email, "email", 100).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Invalid email.");
  const userRole = req.body.Role;
  if (!["Teacher", "Student"].includes(userRole)) fail("Invalid role.");
  const hash = hashPassword(password(req.body.Password));
  const user = await transaction(async (tx) => {
    const user = first(
      await query(
        `INSERT Users (FullName,Email,PasswordHash,Role)
      OUTPUT INSERTED.UserID,INSERTED.FullName,INSERTED.Email,INSERTED.Role
      VALUES (@name,@email,@hash,@userRole)`,
        { name, email, hash, userRole },
        tx,
      ),
    );
    await query(
      userRole === "Teacher"
        ? "INSERT Teachers (TeacherID) VALUES (@uid)"
        : "INSERT Students (StudentID) VALUES (@uid)",
      { uid: user.UserID },
      tx,
    );
    return user;
  });
  createSession(res, user);
  res.status(201).json(user);
});
app.post("/api/auth/login", async (req, res) => {
  const email = text(req.body.Email, "email", 100);
  text(req.body.Password, "password", 128);
  const inputPassword = req.body.Password;
  const user = first(
    await query(
      "SELECT UserID,FullName,Email,Role,PasswordHash FROM Users WHERE Email=@email",
      { email },
    ),
  );
  if (!user || !verifyPassword(inputPassword, user.PasswordHash))
    fail("Email or password is incorrect.", 401);
  delete user.PasswordHash;
  createSession(res, user);
  res.json(user);
});
app.get("/api/auth/me", loginRequired, (req, res) => res.json(req.user));
app.post("/api/auth/logout", logout);
app.use("/api", loginRequired);

app.get("/api/profile", async (req, res) => {
  res.json(
    first(
      await query(
        `SELECT u.UserID,u.FullName,u.Email,u.Role,u.Phone,t.Bio,t.Qualification,s.Institution
    FROM Users u LEFT JOIN Teachers t ON t.TeacherID=u.UserID LEFT JOIN Students s ON s.StudentID=u.UserID
    WHERE u.UserID=@uid`,
        { uid: req.user.UserID },
      ),
    ),
  );
});
app.put("/api/profile", async (req, res) => {
  const uid = req.user.UserID;
  const name = text(req.body.FullName, "name", 100);
  const phone = text(req.body.Phone || "", "phone", 20, false);
  const bio = text(req.body.Bio || "", "bio", 500, false);
  const institution = text(
    req.body.Institution || "",
    "institution",
    100,
    false,
  );
  const qualification = text(
    req.body.Qualification || "",
    "qualification",
    100,
    false,
  );
  let hash = null;
  if (req.body.NewPassword) {
    const user = first(
      await query("SELECT PasswordHash FROM Users WHERE UserID=@uid", { uid }),
    );
    text(req.body.CurrentPassword, "current password", 128);
    if (!verifyPassword(req.body.CurrentPassword, user.PasswordHash))
      fail("Current password is incorrect.");
    hash = hashPassword(password(req.body.NewPassword));
  }
  await transaction(async (tx) => {
    await query(
      "UPDATE Users SET FullName=@name,Phone=@phone,PasswordHash=COALESCE(@hash,PasswordHash) WHERE UserID=@uid",
      { name, phone, hash, uid },
      tx,
    );
    await query(
      req.user.Role === "Teacher"
        ? "UPDATE Teachers SET Bio=@bio,Qualification=@qualification WHERE TeacherID=@uid"
        : "UPDATE Students SET Institution=@institution WHERE StudentID=@uid",
      { uid, bio, qualification, institution },
      tx,
    );
  });
  req.user.FullName = name;
  res.json({ message: "Profile saved." });
});
app.get("/api/categories", async (req, res) =>
  res.json(
    (await query("SELECT * FROM Categories ORDER BY CategoryName")).recordset,
  ),
);
app.get("/api/courses", async (req, res) => {
  const search = text(req.query.search || "", "search", 150, false);
  const uid = req.user.UserID;
  res.json(
    (
      await query(
        `SELECT c.*,CAST(CASE WHEN e.StudentID IS NULL THEN 0 ELSE 1 END AS BIT) AS Enrolled
    FROM vw_CourseEnrollment c LEFT JOIN Enrollments e ON e.CourseID=c.CourseID AND e.StudentID=@uid
    WHERE c.Title LIKE @search AND ${req.user.Role === "Teacher" ? "c.TeacherID=@uid" : "c.IsPublished=1"} ORDER BY c.Title`,
        { search: `%${search}%`, uid },
      )
    ).recordset,
  );
});
app.post("/api/courses", teacher, async (req, res) => {
  const course = first(
    await query(
      `INSERT Courses (TeacherID,CategoryID,Title,Description) OUTPUT INSERTED.* VALUES (@uid,@cat,@title,@description)`,
      {
        uid: req.user.UserID,
        cat: id(req.body.CategoryID),
        title: text(req.body.Title, "title", 150),
        description: text(
          req.body.Description || "",
          "description",
          1000,
          false,
        ),
      },
    ),
  );
  res.status(201).json(course);
});
app.put("/api/courses/:cid", teacher, async (req, res) => {
  await ownCourse(req, req.params.cid);
  await query(
    "UPDATE Courses SET Title=@title,Description=@description,CategoryID=@cat WHERE CourseID=@cid",
    {
      cid: id(req.params.cid),
      title: text(req.body.Title, "title", 150),
      description: text(req.body.Description || "", "description", 1000, false),
      cat: id(req.body.CategoryID),
    },
  );
  res.json({ message: "Course saved." });
});
app.post("/api/courses/:cid/enroll", student, async (req, res) => {
  const request = (await connect()).request();
  await request
    .input("StudentID", sql.Int, req.user.UserID)
    .input("CourseID", sql.Int, id(req.params.cid))
    .execute("dbo.sp_EnrollStudent");
  res.status(201).json({ message: "Enrolled successfully." });
});
app.delete("/api/courses/:cid/enroll", student, async (req, res) => {
  await accessCourse(req, req.params.cid);
  // Remove course-specific student activity before dropping enrollment.
  await transaction(async (tx) => {
    const values = { cid: id(req.params.cid), uid: req.user.UserID };
    await query(
      "DELETE FROM LessonProgress WHERE StudentID=@uid AND LessonID IN (SELECT LessonID FROM Lessons WHERE CourseID=@cid)",
      values,
      tx,
    );
    await query(
      "DELETE FROM Submissions WHERE StudentID=@uid AND AssignmentID IN (SELECT AssignmentID FROM Assignments WHERE CourseID=@cid)",
      values,
      tx,
    );
    await query(
      "DELETE FROM QuizAttempts WHERE StudentID=@uid AND QuizID IN (SELECT QuizID FROM Quizzes WHERE CourseID=@cid)",
      values,
      tx,
    );
    await query(
      "DELETE FROM Enrollments WHERE StudentID=@uid AND CourseID=@cid",
      values,
      tx,
    );
  });
  res.json({ message: "Course dropped." });
});
app.get("/api/progress", student, async (req, res) =>
  res.json(
    (
      await query(
        "SELECT * FROM vw_StudentProgress WHERE StudentID=@uid ORDER BY Title",
        { uid: req.user.UserID },
      )
    ).recordset,
  ),
);
app.get("/api/reports", teacher, async (req, res) => {
  const values = { uid: req.user.UserID };
  const courses = (
    await query(
      "SELECT * FROM vw_CourseEnrollment WHERE TeacherID=@uid ORDER BY Title",
      values,
    )
  ).recordset;
  const progress = (
    await query(
      `SELECT p.*,u.FullName FROM vw_StudentProgress p JOIN Courses c ON c.CourseID=p.CourseID
    JOIN Users u ON u.UserID=p.StudentID WHERE c.TeacherID=@uid ORDER BY p.Title,u.FullName`,
      values,
    )
  ).recordset;
  const quizzes = (
    await query(
      `SELECT c.Title AS Course,q.Title AS Quiz,u.FullName,a.Score,
    (SELECT SUM(Marks) FROM Questions WHERE QuizID=q.QuizID) AS TotalMarks,a.SubmittedAt
    FROM QuizAttempts a JOIN Quizzes q ON q.QuizID=a.QuizID JOIN Courses c ON c.CourseID=q.CourseID
    JOIN Users u ON u.UserID=a.StudentID WHERE c.TeacherID=@uid AND a.SubmittedAt IS NOT NULL ORDER BY a.SubmittedAt DESC`,
      values,
    )
  ).recordset;
  res.json({ courses, progress, quizzes });
});

app.get("/api/courses/:cid/content", async (req, res) => {
  await accessCourse(req, req.params.cid);
  const values = { cid: id(req.params.cid), uid: req.user.UserID };
  const lessons = (
    await query(
      `SELECT l.*,CAST(CASE WHEN p.StudentID IS NULL THEN 0 ELSE 1 END AS BIT) AS Completed
    FROM Lessons l LEFT JOIN LessonProgress p ON p.LessonID=l.LessonID AND p.StudentID=@uid WHERE l.CourseID=@cid ORDER BY LessonNo`,
      values,
    )
  ).recordset;
  const materials = (
    await query(
      "SELECT m.* FROM LessonMaterials m JOIN Lessons l ON l.LessonID=m.LessonID WHERE l.CourseID=@cid",
      values,
    )
  ).recordset;
  const assignments = (
    await query(
      `SELECT a.*,s.SubmissionID,s.FilePath,s.MarksObtained,s.Feedback FROM Assignments a
    LEFT JOIN Submissions s ON s.AssignmentID=a.AssignmentID AND s.StudentID=@uid WHERE a.CourseID=@cid ORDER BY DueDate`,
      values,
    )
  ).recordset;
  const quizzes = (
    await query(
      `SELECT q.*,(SELECT SUM(Marks) FROM Questions WHERE QuizID=q.QuizID) AS TotalMarks
    FROM Quizzes q WHERE CourseID=@cid ORDER BY QuizID`,
      values,
    )
  ).recordset;
  const results = (
    await query(
      `SELECT a.AttemptID,a.QuizID,a.Score,a.SubmittedAt,q.PassingMarks FROM QuizAttempts a JOIN Quizzes q ON q.QuizID=a.QuizID
    WHERE q.CourseID=@cid AND a.StudentID=@uid AND a.SubmittedAt IS NOT NULL ORDER BY a.SubmittedAt DESC`,
      values,
    )
  ).recordset;
  const announcements = (
    await query(
      "SELECT * FROM Announcements WHERE CourseID=@cid ORDER BY PostedAt DESC",
      values,
    )
  ).recordset;
  res.json({
    lessons,
    materials,
    assignments,
    quizzes,
    results,
    announcements,
  });
});

// Ownership is checked before accepting a potentially large uploaded file.
app.post(
  "/api/courses/:cid/lessons",
  teacher,
  async (req, res, next) => {
    await ownCourse(req, req.params.cid);
    next();
  },
  upload.single("file"),
  async (req, res) => {
    const video = req.file ? filePath(req) : null;
    if (
      req.file &&
      ![".mp4", ".webm"].includes(path.extname(req.file.filename))
    )
      fail("Choose an MP4 or WebM video.");
    const values = {
      cid: id(req.params.cid),
      number: integer(req.body.LessonNo, "lesson number"),
      title: text(req.body.Title, "title", 150),
      video,
      duration: req.body.DurationMin
        ? integer(req.body.DurationMin, "duration")
        : null,
    };
    const lesson = await transaction(async (tx) => {
      const lesson = first(
        await query(
          `INSERT Lessons (CourseID,LessonNo,Title,VideoPath,DurationMin) OUTPUT INSERTED.* VALUES (@cid,@number,@title,@video,@duration)`,
          values,
          tx,
        ),
      );
      await query(
        "UPDATE Enrollments SET CompletedAt=NULL WHERE CourseID=@cid",
        { cid: id(req.params.cid) },
        tx,
      );
      return lesson;
    });
    res.status(201).json(lesson);
  },
);
app.post(
  "/api/lessons/:lid/materials",
  teacher,
  async (req, res, next) => {
    const lesson = first(
      await query("SELECT CourseID FROM Lessons WHERE LessonID=@lid", {
        lid: id(req.params.lid),
      }),
    );
    if (!lesson) fail("Lesson not found.", 404);
    await ownCourse(req, lesson.CourseID);
    next();
  },
  upload.single("file"),
  async (req, res) => {
    const file = filePath(req);
    await query(
      "INSERT LessonMaterials (LessonID,Title,FilePath) VALUES (@lid,@title,@file)",
      {
        lid: id(req.params.lid),
        title: text(req.body.Title, "title", 150),
        file,
      },
    );
    res.status(201).json({ message: "Material added." });
  },
);
app.post("/api/lessons/:lid/complete", student, async (req, res) => {
  const lid = id(req.params.lid),
    uid = req.user.UserID;
  const lesson = first(
    await query("SELECT CourseID FROM Lessons WHERE LessonID=@lid", { lid }),
  );
  if (!lesson) fail("Lesson not found.", 404);
  await accessCourse(req, lesson.CourseID);
  await transaction(async (tx) => {
    const values = { lid, uid, cid: lesson.CourseID };
    await query(
      `IF NOT EXISTS (SELECT 1 FROM LessonProgress WITH (UPDLOCK,HOLDLOCK) WHERE StudentID=@uid AND LessonID=@lid)
      INSERT LessonProgress (StudentID,LessonID) VALUES (@uid,@lid)`,
      values,
      tx,
    );
    await query(
      `UPDATE Enrollments SET CompletedAt=COALESCE(CompletedAt,SYSDATETIME()) WHERE StudentID=@uid AND CourseID=@cid
      AND NOT EXISTS (SELECT 1 FROM Lessons l WHERE CourseID=@cid AND NOT EXISTS
        (SELECT 1 FROM LessonProgress p WHERE p.StudentID=@uid AND p.LessonID=l.LessonID))`,
      values,
      tx,
    );
  });
  res.json({ message: "Lesson completed." });
});

app.post("/api/courses/:cid/assignments", teacher, async (req, res) => {
  await ownCourse(req, req.params.cid);
  const due = new Date(req.body.DueDate);
  if (Number.isNaN(due.getTime())) fail("Invalid due date.");
  await query(
    "INSERT Assignments (CourseID,Title,Instructions,DueDate,TotalMarks) VALUES (@cid,@title,@instructions,@due,@marks)",
    {
      cid: id(req.params.cid),
      title: text(req.body.Title, "title", 150),
      instructions: text(
        req.body.Instructions || "",
        "instructions",
        1000,
        false,
      ),
      due,
      marks: integer(req.body.TotalMarks, "total marks"),
    },
  );
  res.status(201).json({ message: "Assignment created." });
});
app.post(
  "/api/assignments/:aid/submit",
  student,
  async (req, res, next) => {
    const assignment = first(
      await query("SELECT * FROM Assignments WHERE AssignmentID=@aid", {
        aid: id(req.params.aid),
      }),
    );
    if (!assignment) fail("Assignment not found.", 404);
    await accessCourse(req, assignment.CourseID);
    req.assignment = assignment;
    next();
  },
  upload.single("file"),
  async (req, res) => {
    const file = filePath(req);
    // Late work is accepted and labeled for the teacher, matching the sample dataset.
    await query(
      "INSERT Submissions (AssignmentID,StudentID,FilePath) VALUES (@aid,@uid,@file)",
      { aid: id(req.params.aid), uid: req.user.UserID, file },
    );
    res.status(201).json({ message: "Assignment submitted." });
  },
);
app.get("/api/courses/:cid/submissions", teacher, async (req, res) => {
  await ownCourse(req, req.params.cid);
  res.json(
    (
      await query(
        `SELECT s.*,a.Title,a.TotalMarks,a.DueDate,u.FullName,
    CAST(CASE WHEN s.SubmittedAt>a.DueDate THEN 1 ELSE 0 END AS BIT) AS IsLate
    FROM Submissions s JOIN Assignments a ON a.AssignmentID=s.AssignmentID JOIN Users u ON u.UserID=s.StudentID
    WHERE a.CourseID=@cid ORDER BY s.SubmittedAt`,
        { cid: id(req.params.cid) },
      )
    ).recordset,
  );
});
app.put("/api/submissions/:sid/grade", teacher, async (req, res) => {
  const submission = first(
    await query(
      `SELECT a.CourseID,a.TotalMarks FROM Submissions s JOIN Assignments a ON a.AssignmentID=s.AssignmentID WHERE s.SubmissionID=@sid`,
      { sid: id(req.params.sid) },
    ),
  );
  if (!submission) fail("Submission not found.", 404);
  await ownCourse(req, submission.CourseID);
  await query(
    "UPDATE Submissions SET MarksObtained=@marks,Feedback=@feedback,GradedAt=SYSDATETIME() WHERE SubmissionID=@sid",
    {
      sid: id(req.params.sid),
      marks: integer(req.body.MarksObtained, "marks", 0, submission.TotalMarks),
      feedback: text(req.body.Feedback || "", "feedback", 500, false),
    },
  );
  res.json({ message: "Grade saved." });
});

app.post("/api/courses/:cid/quizzes", teacher, async (req, res) => {
  await ownCourse(req, req.params.cid);
  const title = text(req.body.Title, "quiz title", 150);
  const limit = integer(req.body.TimeLimitMin, "time limit", 1, 180);
  const questions = req.body.Questions;
  if (
    !Array.isArray(questions) ||
    questions.length < 1 ||
    questions.length > 30
  )
    fail("Add 1–30 questions.");
  let total = 0;
  for (const q of questions) {
    q.QuestionText = text(q.QuestionText, "question", 500);
    q.Marks = integer(q.Marks, "marks", 1, 100);
    total += q.Marks;
    if (
      !Array.isArray(q.Options) ||
      q.Options.length !== 4 ||
      !["A", "B", "C", "D"].includes(q.Correct)
    )
      fail("Provide four options and one correct answer.");
    q.Options = q.Options.map((o) => text(o, "option", 300));
  }
  const passing = integer(req.body.PassingMarks, "passing marks", 0, total);
  await transaction(async (tx) => {
    const quiz = first(
      await query(
        "INSERT Quizzes (CourseID,Title,TimeLimitMin,PassingMarks) OUTPUT INSERTED.QuizID VALUES (@cid,@title,@limit,@passing)",
        { cid: id(req.params.cid), title, limit, passing },
        tx,
      ),
    );
    for (const q of questions) {
      const question = first(
        await query(
          "INSERT Questions (QuizID,QuestionText,Marks) OUTPUT INSERTED.QuestionID VALUES (@qid,@body,@marks)",
          { qid: quiz.QuizID, body: q.QuestionText, marks: q.Marks },
          tx,
        ),
      );
      for (let i = 0; i < 4; i++) {
        const label = "ABCD"[i];
        await query(
          "INSERT QuestionOptions (QuestionID,OptionLabel,OptionText,IsCorrect) VALUES (@qid,@label,@body,@correct)",
          {
            qid: question.QuestionID,
            label,
            body: q.Options[i],
            correct: label === q.Correct,
          },
          tx,
        );
      }
    }
  });
  res.status(201).json({ message: "Quiz created." });
});
app.post("/api/quizzes/:qid/start", student, async (req, res) => {
  const qid = id(req.params.qid),
    uid = req.user.UserID;
  const quiz = first(
    await query("SELECT * FROM Quizzes WHERE QuizID=@qid", { qid }),
  );
  if (!quiz) fail("Quiz not found.", 404);
  await accessCourse(req, quiz.CourseID);
  // Reuse an open attempt so refreshing cannot reset the timer.
  const attempt = await transaction(async (tx) => {
    let current = first(
      await query(
        `SELECT TOP 1 * FROM QuizAttempts WITH (UPDLOCK,HOLDLOCK)
      WHERE QuizID=@qid AND StudentID=@uid AND SubmittedAt IS NULL
      AND DATEDIFF(SECOND,StartedAt,SYSDATETIME()) < @seconds ORDER BY AttemptID DESC`,
        { qid, uid, seconds: quiz.TimeLimitMin * 60 },
        tx,
      ),
    );
    if (!current)
      current = first(
        await query(
          "INSERT QuizAttempts (QuizID,StudentID) OUTPUT INSERTED.* VALUES (@qid,@uid)",
          { qid, uid },
          tx,
        ),
      );
    return current;
  });
  const remaining = first(
    await query(
      "SELECT @seconds-DATEDIFF(SECOND,StartedAt,SYSDATETIME()) AS RemainingSeconds FROM QuizAttempts WHERE AttemptID=@aid",
      { seconds: quiz.TimeLimitMin * 60, aid: attempt.AttemptID },
    ),
  ).RemainingSeconds;
  const questions = (
    await query(
      "SELECT QuestionID,QuestionText,Marks FROM Questions WHERE QuizID=@qid ORDER BY QuestionID",
      { qid },
    )
  ).recordset;
  const options = (
    await query(
      "SELECT o.QuestionID,o.OptionLabel,o.OptionText FROM QuestionOptions o JOIN Questions q ON q.QuestionID=o.QuestionID WHERE q.QuizID=@qid ORDER BY o.OptionLabel",
      { qid },
    )
  ).recordset;
  res.json({
    ...quiz,
    AttemptID: attempt.AttemptID,
    RemainingSeconds: remaining,
    questions,
    options,
  });
});
app.post("/api/attempts/:aid/submit", student, async (req, res) => {
  if (!Array.isArray(req.body.Answers) || req.body.Answers.length > 100)
    fail("Invalid answers.");
  const request = (await connect()).request();
  const result = await request
    .input("StudentID", sql.Int, req.user.UserID)
    .input("AttemptID", sql.Int, id(req.params.aid))
    .input("Answers", sql.NVarChar(sql.MAX), JSON.stringify(req.body.Answers))
    .execute("dbo.sp_SubmitQuiz");
  res.json(first(result));
});

app.post("/api/courses/:cid/announcements", teacher, async (req, res) => {
  await ownCourse(req, req.params.cid);
  await query(
    "INSERT Announcements (CourseID,Title,Message) VALUES (@cid,@title,@message)",
    {
      cid: id(req.params.cid),
      title: text(req.body.Title, "title", 150),
      message: text(req.body.Message, "message", 1000),
    },
  );
  res.status(201).json({ message: "Announcement posted." });
});
app.delete("/api/announcements/:aid", teacher, async (req, res) => {
  const announcement = first(
    await query(
      "SELECT CourseID FROM Announcements WHERE AnnouncementID=@aid",
      { aid: id(req.params.aid) },
    ),
  );
  if (!announcement) fail("Announcement not found.", 404);
  await ownCourse(req, announcement.CourseID);
  await query("DELETE FROM Announcements WHERE AnnouncementID=@aid", {
    aid: id(req.params.aid),
  });
  res.json({ message: "Announcement deleted." });
});

// File downloads go through enrollment/ownership checks, never a public uploads folder.
app.get("/api/files/:name", async (req, res) => {
  const file = `uploads/${req.params.name}`;
  if (path.basename(req.params.name) !== req.params.name) fail("Invalid file.");
  const matches = (
    await query(
      `SELECT CourseID,NULL AS StudentID FROM Lessons WHERE VideoPath=@file
    UNION ALL SELECT l.CourseID,NULL FROM LessonMaterials m JOIN Lessons l ON l.LessonID=m.LessonID WHERE m.FilePath=@file
    UNION ALL SELECT a.CourseID,s.StudentID FROM Submissions s JOIN Assignments a ON a.AssignmentID=s.AssignmentID WHERE s.FilePath=@file`,
      { file },
    )
  ).recordset;
  if (!matches.length)
    fail(
      "File not found. Sample file paths do not include actual files; upload a file first.",
      404,
    );
  const match = matches[0];
  await accessCourse(req, match.CourseID);
  if (
    match.StudentID &&
    req.user.Role === "Student" &&
    match.StudentID !== req.user.UserID
  )
    fail("Access denied.", 403);
  const full = path.join(uploadDir, req.params.name);
  if (!existsSync(full))
    fail(
      "This sample file is not included. Upload a real file to use this feature.",
      404,
    );
  res.setHeader("X-Content-Type-Options", "nosniff");
  if ([".mp4", ".webm", ".pdf"].includes(path.extname(full)))
    res.sendFile(full);
  else res.download(full);
});

app.use("/api", (req, res) =>
  res.status(404).json({ message: "API route not found." }),
);
app.use(express.static(path.join(root, "dist")));
app.get("/", (req, res) => {
  if (existsSync(path.join(root, "dist/index.html")))
    res.sendFile(path.join(root, "dist/index.html"));
  else
    res
      .type("text")
      .send(
        "Run npm run dev for the frontend, or npm run build then npm start.",
      );
});
app.use(async (error, req, res, next) => {
  if (req.file) await unlink(req.file.path).catch(() => {});
  console.error(error.message);
  const number = error.number || error.originalError?.info?.number;
  let status = error.status || 500,
    message = error.status
      ? error.message
      : "Database or server error. Check the server terminal.";
  if ([2601, 2627].includes(number)) {
    status = 409;
    message =
      "This record already exists (email, enrollment, lesson number, or submission).";
  }
  if (number >= 50001 && number <= 50009) {
    status = 400;
    message = error.message;
  }
  if (number === 547) {
    status = 400;
    message = "Invalid reference or value.";
  }
  if (error instanceof multer.MulterError) {
    status = 400;
    message =
      error.code === "LIMIT_FILE_SIZE"
        ? "File must be under 100 MB."
        : error.message;
  }
  if (error.message === "Unsupported file type.") {
    status = 400;
    message = error.message;
  }
  if (error.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid JSON.";
  }
  res.status(status).json({ message });
});

const port = Number(process.env.PORT || 3001);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await connect();
    app.listen(port, "127.0.0.1", () =>
      console.log(`LMS: http://localhost:${port}`),
    );
  } catch (error) {
    console.error(
      "SQL Server connection failed:",
      error.message,
      "\nCheck .env and run npm run db:setup.",
    );
    process.exitCode = 1;
  }
}
export default app;
