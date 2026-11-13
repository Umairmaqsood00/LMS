USE LMS_Project_DB;
GO

CREATE OR ALTER VIEW dbo.vw_CourseEnrollment AS
SELECT c.CourseID, c.TeacherID, c.CategoryID, c.Title, c.Description,
       c.IsPublished, u.FullName AS TeacherName, cat.CategoryName,
       COUNT(e.StudentID) AS EnrolledStudents,
       COUNT(e.CompletedAt) AS CompletedStudents
FROM dbo.Courses c
JOIN dbo.Users u ON u.UserID = c.TeacherID
JOIN dbo.Categories cat ON cat.CategoryID = c.CategoryID
LEFT JOIN dbo.Enrollments e ON e.CourseID = c.CourseID
GROUP BY c.CourseID, c.TeacherID, c.CategoryID, c.Title, c.Description,
         c.IsPublished, u.FullName, cat.CategoryName;
GO

CREATE OR ALTER VIEW dbo.vw_StudentProgress AS
SELECT e.StudentID, e.CourseID, c.Title, e.CompletedAt,
       COUNT(l.LessonID) AS TotalLessons, COUNT(lp.LessonID) AS CompletedLessons,
       CAST(COALESCE(100.0 * COUNT(lp.LessonID) / NULLIF(COUNT(l.LessonID), 0), 0)
            AS DECIMAL(5,1)) AS ProgressPercent
FROM dbo.Enrollments e
JOIN dbo.Courses c ON c.CourseID = e.CourseID
LEFT JOIN dbo.Lessons l ON l.CourseID = e.CourseID
LEFT JOIN dbo.LessonProgress lp ON lp.StudentID = e.StudentID AND lp.LessonID = l.LessonID
GROUP BY e.StudentID, e.CourseID, c.Title, e.CompletedAt;
GO

CREATE OR ALTER PROCEDURE dbo.sp_EnrollStudent
    @StudentID INT, @CourseID INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Students WHERE StudentID = @StudentID)
        THROW 50001, 'Student not found.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Courses WHERE CourseID = @CourseID AND IsPublished = 1)
        THROW 50002, 'Published course not found.', 1;
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM dbo.Enrollments WITH (UPDLOCK, HOLDLOCK)
               WHERE StudentID = @StudentID AND CourseID = @CourseID)
    BEGIN
        ROLLBACK;
        THROW 50003, 'You are already enrolled.', 1;
    END;
    INSERT dbo.Enrollments (StudentID, CourseID) VALUES (@StudentID, @CourseID);
    COMMIT;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_SubmitQuiz
    @StudentID INT, @AttemptID INT, @Answers NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @QuizID INT, @StartedAt DATETIME2(0), @Limit INT;
        SELECT @QuizID = a.QuizID, @StartedAt = a.StartedAt, @Limit = q.TimeLimitMin
        FROM dbo.QuizAttempts a WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.Quizzes q ON q.QuizID = a.QuizID
        WHERE a.AttemptID = @AttemptID AND a.StudentID = @StudentID AND a.SubmittedAt IS NULL;
        IF @QuizID IS NULL THROW 50004, 'Open attempt not found.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Enrollments e JOIN dbo.Quizzes q ON q.CourseID = e.CourseID
                       WHERE e.StudentID = @StudentID AND q.QuizID = @QuizID)
            THROW 50005, 'Enroll in the course first.', 1;
        IF DATEDIFF(SECOND, @StartedAt, SYSDATETIME()) > @Limit * 60 + 15
            THROW 50006, 'Quiz time has expired. Start a new attempt.', 1;
        IF ISJSON(@Answers) <> 1 OR LEFT(LTRIM(@Answers), 1) <> '['
            THROW 50007, 'Invalid answers.', 1;
        DECLARE @Selected TABLE (QuestionID INT, OptionLabel VARCHAR(20));
        INSERT @Selected SELECT QuestionID, OptionLabel FROM OPENJSON(@Answers)
        WITH (QuestionID INT, OptionLabel VARCHAR(20));
        IF EXISTS (SELECT QuestionID FROM @Selected GROUP BY QuestionID HAVING COUNT(*) > 1)
            THROW 50008, 'Each question can have only one answer.', 1;
        IF EXISTS (SELECT 1 FROM @Selected a
                   LEFT JOIN dbo.Questions q ON q.QuestionID = a.QuestionID AND q.QuizID = @QuizID
                   LEFT JOIN dbo.QuestionOptions o ON o.QuestionID = a.QuestionID AND o.OptionLabel = a.OptionLabel
                   WHERE q.QuestionID IS NULL OR o.QuestionID IS NULL OR LEN(a.OptionLabel) <> 1)
            THROW 50009, 'An answer does not belong to this quiz.', 1;
        INSERT dbo.AttemptAnswers (AttemptID, QuestionID, OptionLabel)
        SELECT @AttemptID, QuestionID, OptionLabel FROM @Selected;
        DECLARE @Score INT;
        SELECT @Score = COALESCE(SUM(CASE WHEN o.IsCorrect = 1 THEN q.Marks ELSE 0 END), 0)
        FROM @Selected a JOIN dbo.Questions q ON q.QuestionID = a.QuestionID
        JOIN dbo.QuestionOptions o ON o.QuestionID = a.QuestionID AND o.OptionLabel = a.OptionLabel;
        UPDATE dbo.QuizAttempts SET Score = @Score, SubmittedAt = SYSDATETIME() WHERE AttemptID = @AttemptID;
        SELECT @AttemptID AS AttemptID, @Score AS Score, q.PassingMarks,
               (SELECT SUM(Marks) FROM dbo.Questions WHERE QuizID = @QuizID) AS TotalMarks,
               CAST(CASE WHEN @Score >= q.PassingMarks THEN 1 ELSE 0 END AS BIT) AS Passed
        FROM dbo.Quizzes q WHERE q.QuizID = @QuizID;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH;
END;
GO
