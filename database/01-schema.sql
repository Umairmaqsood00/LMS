USE LMS_Project_DB;
GO

CREATE TABLE Users (
    UserID        INT IDENTITY(1,1) NOT NULL,
    FullName      NVARCHAR(100)     NOT NULL,
    Email         VARCHAR(100)      NOT NULL,
    PasswordHash  VARCHAR(255)      NOT NULL,
    Role          VARCHAR(10)       NOT NULL,
    Phone         VARCHAR(20)       NULL,
    CreatedAt     DATETIME2(0)      NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Users       PRIMARY KEY (UserID),
    CONSTRAINT UQ_Users_Email UNIQUE (Email),
    CONSTRAINT CK_Users_Role  CHECK (Role IN ('Teacher', 'Student'))
);
GO

CREATE TABLE Teachers (
    TeacherID      INT           NOT NULL,
    Qualification  NVARCHAR(100) NULL,
    Bio            NVARCHAR(500) NULL,
    CONSTRAINT PK_Teachers       PRIMARY KEY (TeacherID),
    CONSTRAINT FK_Teachers_Users FOREIGN KEY (TeacherID) REFERENCES Users(UserID) ON DELETE CASCADE
);
GO

CREATE TABLE Students (
    StudentID    INT           NOT NULL,
    DateOfBirth  DATE          NULL,
    Institution  NVARCHAR(100) NULL,
    CONSTRAINT PK_Students       PRIMARY KEY (StudentID),
    CONSTRAINT FK_Students_Users FOREIGN KEY (StudentID) REFERENCES Users(UserID) ON DELETE CASCADE
);
GO

CREATE TABLE Categories (
    CategoryID    INT IDENTITY(1,1) NOT NULL,
    CategoryName  NVARCHAR(50)      NOT NULL,
    CONSTRAINT PK_Categories      PRIMARY KEY (CategoryID),
    CONSTRAINT UQ_Categories_Name UNIQUE (CategoryName)
);
GO

CREATE TABLE Courses (
    CourseID     INT IDENTITY(1,1) NOT NULL,
    TeacherID    INT               NOT NULL,
    CategoryID   INT               NOT NULL,
    Title        NVARCHAR(150)     NOT NULL,
    Description  NVARCHAR(1000)    NULL,
    CreatedAt    DATE              NOT NULL CONSTRAINT DF_Courses_CreatedAt DEFAULT CAST(GETDATE() AS DATE),
    IsPublished  BIT               NOT NULL CONSTRAINT DF_Courses_IsPublished DEFAULT 1,
    CONSTRAINT PK_Courses            PRIMARY KEY (CourseID),
    CONSTRAINT FK_Courses_Teachers   FOREIGN KEY (TeacherID)  REFERENCES Teachers(TeacherID),
    CONSTRAINT FK_Courses_Categories FOREIGN KEY (CategoryID) REFERENCES Categories(CategoryID)
);
GO

CREATE TABLE Lessons (
    LessonID     INT IDENTITY(1,1) NOT NULL,
    CourseID     INT               NOT NULL,
    LessonNo     INT               NOT NULL,
    Title        NVARCHAR(150)     NOT NULL,
    VideoPath    VARCHAR(255)      NULL,
    DurationMin  INT               NULL,
    CONSTRAINT PK_Lessons           PRIMARY KEY (LessonID),
    CONSTRAINT UQ_Lessons_Order     UNIQUE (CourseID, LessonNo),
    CONSTRAINT FK_Lessons_Courses   FOREIGN KEY (CourseID) REFERENCES Courses(CourseID) ON DELETE CASCADE,
    CONSTRAINT CK_Lessons_LessonNo  CHECK (LessonNo > 0),
    CONSTRAINT CK_Lessons_Duration  CHECK (DurationMin > 0)
);
GO

CREATE TABLE LessonMaterials (
    MaterialID  INT IDENTITY(1,1) NOT NULL,
    LessonID    INT               NOT NULL,
    Title       NVARCHAR(150)     NOT NULL,
    FilePath    VARCHAR(255)      NOT NULL,
    UploadedAt  DATETIME2(0)      NOT NULL CONSTRAINT DF_LessonMaterials_UploadedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_LessonMaterials         PRIMARY KEY (MaterialID),
    CONSTRAINT FK_LessonMaterials_Lessons FOREIGN KEY (LessonID) REFERENCES Lessons(LessonID) ON DELETE CASCADE
);
GO

CREATE TABLE Enrollments (
    StudentID    INT          NOT NULL,
    CourseID     INT          NOT NULL,
    EnrolledAt   DATETIME2(0) NOT NULL CONSTRAINT DF_Enrollments_EnrolledAt DEFAULT SYSDATETIME(),
    CompletedAt  DATETIME2(0) NULL,
    CONSTRAINT PK_Enrollments          PRIMARY KEY (StudentID, CourseID),
    CONSTRAINT FK_Enrollments_Students FOREIGN KEY (StudentID) REFERENCES Students(StudentID) ON DELETE CASCADE,
    CONSTRAINT FK_Enrollments_Courses  FOREIGN KEY (CourseID)  REFERENCES Courses(CourseID)   ON DELETE CASCADE
);
GO

CREATE TABLE LessonProgress (
    StudentID    INT          NOT NULL,
    LessonID     INT          NOT NULL,
    CompletedAt  DATETIME2(0) NOT NULL CONSTRAINT DF_LessonProgress_CompletedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_LessonProgress          PRIMARY KEY (StudentID, LessonID),
    CONSTRAINT FK_LessonProgress_Students FOREIGN KEY (StudentID) REFERENCES Students(StudentID) ON DELETE CASCADE,
    CONSTRAINT FK_LessonProgress_Lessons  FOREIGN KEY (LessonID)  REFERENCES Lessons(LessonID)   ON DELETE CASCADE
);
GO

CREATE TABLE Quizzes (
    QuizID        INT IDENTITY(1,1) NOT NULL,
    CourseID      INT               NOT NULL,
    Title         NVARCHAR(150)     NOT NULL,
    TimeLimitMin  INT               NOT NULL,
    PassingMarks  INT               NOT NULL,
    CreatedAt     DATETIME2(0)      NOT NULL CONSTRAINT DF_Quizzes_CreatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Quizzes          PRIMARY KEY (QuizID),
    CONSTRAINT FK_Quizzes_Courses  FOREIGN KEY (CourseID) REFERENCES Courses(CourseID) ON DELETE CASCADE,
    CONSTRAINT CK_Quizzes_Time     CHECK (TimeLimitMin > 0),
    CONSTRAINT CK_Quizzes_Passing  CHECK (PassingMarks >= 0)
);
GO

CREATE TABLE Questions (
    QuestionID    INT IDENTITY(1,1) NOT NULL,
    QuizID        INT               NOT NULL,
    QuestionText  NVARCHAR(500)     NOT NULL,
    Marks         INT               NOT NULL CONSTRAINT DF_Questions_Marks DEFAULT 1,
    CONSTRAINT PK_Questions         PRIMARY KEY (QuestionID),
    CONSTRAINT FK_Questions_Quizzes FOREIGN KEY (QuizID) REFERENCES Quizzes(QuizID) ON DELETE CASCADE,
    CONSTRAINT CK_Questions_Marks   CHECK (Marks > 0)
);
GO

CREATE TABLE QuestionOptions (
    QuestionID   INT           NOT NULL,
    OptionLabel  CHAR(1)       NOT NULL,
    OptionText   NVARCHAR(300) NOT NULL,
    IsCorrect    BIT           NOT NULL CONSTRAINT DF_QuestionOptions_IsCorrect DEFAULT 0,
    CONSTRAINT PK_QuestionOptions           PRIMARY KEY (QuestionID, OptionLabel),
    CONSTRAINT FK_QuestionOptions_Questions FOREIGN KEY (QuestionID) REFERENCES Questions(QuestionID) ON DELETE CASCADE,
    CONSTRAINT CK_QuestionOptions_Label     CHECK (OptionLabel IN ('A', 'B', 'C', 'D'))
);
GO

CREATE TABLE QuizAttempts (
    AttemptID    INT IDENTITY(1,1) NOT NULL,
    QuizID       INT               NOT NULL,
    StudentID    INT               NOT NULL,
    StartedAt    DATETIME2(0)      NOT NULL CONSTRAINT DF_QuizAttempts_StartedAt DEFAULT SYSDATETIME(),
    SubmittedAt  DATETIME2(0)      NULL,
    Score        INT               NULL,
    CONSTRAINT PK_QuizAttempts          PRIMARY KEY (AttemptID),
    CONSTRAINT FK_QuizAttempts_Quizzes  FOREIGN KEY (QuizID)    REFERENCES Quizzes(QuizID)       ON DELETE CASCADE,
    CONSTRAINT FK_QuizAttempts_Students FOREIGN KEY (StudentID) REFERENCES Students(StudentID)   ON DELETE CASCADE,
    CONSTRAINT CK_QuizAttempts_Score    CHECK (Score >= 0)
);
GO

CREATE TABLE AttemptAnswers (
    AttemptID    INT     NOT NULL,
    QuestionID   INT     NOT NULL,
    OptionLabel  CHAR(1) NOT NULL,
    CONSTRAINT PK_AttemptAnswers                 PRIMARY KEY (AttemptID, QuestionID),
    CONSTRAINT FK_AttemptAnswers_QuizAttempts    FOREIGN KEY (AttemptID) REFERENCES QuizAttempts(AttemptID) ON DELETE CASCADE,
    CONSTRAINT FK_AttemptAnswers_QuestionOptions FOREIGN KEY (QuestionID, OptionLabel)
                                                 REFERENCES QuestionOptions(QuestionID, OptionLabel)
);
GO

CREATE TABLE Assignments (
    AssignmentID  INT IDENTITY(1,1) NOT NULL,
    CourseID      INT               NOT NULL,
    Title         NVARCHAR(150)     NOT NULL,
    Instructions  NVARCHAR(1000)    NULL,
    DueDate       DATETIME2(0)      NOT NULL,
    TotalMarks    INT               NOT NULL,
    CreatedAt     DATETIME2(0)      NOT NULL CONSTRAINT DF_Assignments_CreatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Assignments         PRIMARY KEY (AssignmentID),
    CONSTRAINT FK_Assignments_Courses FOREIGN KEY (CourseID) REFERENCES Courses(CourseID) ON DELETE CASCADE,
    CONSTRAINT CK_Assignments_Total   CHECK (TotalMarks > 0)
);
GO

CREATE TABLE Submissions (
    SubmissionID   INT IDENTITY(1,1) NOT NULL,
    AssignmentID   INT               NOT NULL,
    StudentID      INT               NOT NULL,
    FilePath       VARCHAR(255)      NOT NULL,
    SubmittedAt    DATETIME2(0)      NOT NULL CONSTRAINT DF_Submissions_SubmittedAt DEFAULT SYSDATETIME(),
    MarksObtained  INT               NULL,
    Feedback       NVARCHAR(500)     NULL,
    GradedAt       DATETIME2(0)      NULL,
    CONSTRAINT PK_Submissions             PRIMARY KEY (SubmissionID),
    CONSTRAINT UQ_Submissions_OnePerStd   UNIQUE (AssignmentID, StudentID),
    CONSTRAINT FK_Submissions_Assignments FOREIGN KEY (AssignmentID) REFERENCES Assignments(AssignmentID) ON DELETE CASCADE,
    CONSTRAINT FK_Submissions_Students    FOREIGN KEY (StudentID)    REFERENCES Students(StudentID)       ON DELETE CASCADE,
    CONSTRAINT CK_Submissions_Marks       CHECK (MarksObtained >= 0)
);
GO

CREATE TABLE Announcements (
    AnnouncementID  INT IDENTITY(1,1) NOT NULL,
    CourseID        INT               NOT NULL,
    Title           NVARCHAR(150)     NOT NULL,
    Message         NVARCHAR(1000)    NOT NULL,
    PostedAt        DATETIME2(0)      NOT NULL CONSTRAINT DF_Announcements_PostedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Announcements         PRIMARY KEY (AnnouncementID),
    CONSTRAINT FK_Announcements_Courses FOREIGN KEY (CourseID) REFERENCES Courses(CourseID) ON DELETE CASCADE
);
GO

INSERT INTO Users (FullName, Email, PasswordHash, Role, Phone, CreatedAt) VALUES
(N'Dr. Ayesha Khan',  'ayesha.khan@lms.edu',      CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'ayesha@123'), 2), 'Teacher', '0300-1111111', '2026-08-01 09:00'),
(N'Mr. Bilal Ahmed',  'bilal.ahmed@lms.edu',      CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'bilal@123'),  2), 'Teacher', '0300-2222222', '2026-08-01 09:30'),
(N'Ms. Sara Malik',   'sara.malik@lms.edu',       CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'sara@123'),   2), 'Teacher', '0300-3333333', '2026-08-02 10:00'),
(N'Ali Raza',         'ali.raza@student.lms.edu', CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'ali@123'),    2), 'Student', '0311-4444444', '2026-08-10 11:00'),
(N'Fatima Noor',      'fatima.noor@student.lms.edu', CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'fatima@123'), 2), 'Student', '0311-5555555', '2026-08-10 12:00'),
(N'Hamza Tariq',      'hamza.tariq@student.lms.edu', CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'hamza@123'),  2), 'Student', NULL,           '2026-08-11 09:15'),
(N'Zainab Iqbal',     'zainab.iqbal@student.lms.edu', CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'zainab@123'), 2), 'Student', '0311-7777777', '2026-08-12 14:40'),
(N'Usman Ghani',      'usman.ghani@student.lms.edu', CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'usman@123'),  2), 'Student', NULL,           '2026-08-13 16:20'),
(N'Hira Shah',        'hira.shah@student.lms.edu',   CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'hira@123'),   2), 'Student', '0311-9999999', '2026-08-14 08:05');

INSERT INTO Teachers (TeacherID, Qualification, Bio) VALUES
(1, N'PhD Computer Science', N'Teaches programming and web development.'),
(2, N'MS Data Science',      N'Database specialist with 8 years of teaching experience.'),
(3, N'MPhil Mathematics',    N'Loves making calculus easy.');

INSERT INTO Students (StudentID, DateOfBirth, Institution) VALUES
(4, '2004-03-15', N'FAST NUCES Lahore'),
(5, '2004-07-22', N'FAST NUCES Lahore'),
(6, '2003-11-02', N'UET Lahore'),
(7, '2005-01-30', N'Punjab University'),
(8, '2004-05-18', N'FAST NUCES Lahore'),
(9, '2005-09-09', N'LUMS');

INSERT INTO Categories (CategoryName) VALUES
(N'Programming'), (N'Databases'), (N'Mathematics'), (N'Web Development'), (N'Artificial Intelligence');

INSERT INTO Courses (TeacherID, CategoryID, Title, Description, CreatedAt) VALUES
(1, 1, N'Introduction to Programming', N'Learn C++ from scratch: variables, loops and functions.', '2026-08-05'),
(2, 2, N'Database Systems',            N'ER modeling, normalization and SQL basics.',             '2026-08-06'),
(2, 2, N'Advanced SQL',                N'Joins, subqueries and query optimization in SQL Server.', '2026-08-07'),
(3, 3, N'Calculus I',                  N'Limits and derivatives with solved examples.',           '2026-08-08'),
(1, 4, N'Web Development with React',  N'Build modern websites using React and Tailwind CSS.',    '2026-08-09');

INSERT INTO Lessons (CourseID, LessonNo, Title, VideoPath, DurationMin) VALUES
(1, 1, N'Variables and Data Types', 'videos/c1/l1.mp4', 25),
(1, 2, N'Conditions and Loops',     'videos/c1/l2.mp4', 30),
(1, 3, N'Functions',                'videos/c1/l3.mp4', 28),
(2, 1, N'Introduction to DBMS',     'videos/c2/l1.mp4', 20),
(2, 2, N'ER Modeling',              'videos/c2/l2.mp4', 35),
(2, 3, N'Normalization up to BCNF', 'videos/c2/l3.mp4', 40),
(2, 4, N'SQL Basics',               'videos/c2/l4.mp4', 32),
(3, 1, N'Joins in Depth',           'videos/c3/l1.mp4', 45),
(3, 2, N'Subqueries',               'videos/c3/l2.mp4', 38),
(4, 1, N'Limits',                   'videos/c4/l1.mp4', 30),
(4, 2, N'Derivatives',              'videos/c4/l2.mp4', 33),
(5, 1, N'React Basics',             'videos/c5/l1.mp4', 27);

INSERT INTO LessonMaterials (LessonID, Title, FilePath, UploadedAt) VALUES
(1,  N'Data Types Slides',      'files/c1/datatypes.pdf',    '2026-08-05 10:00'),
(5,  N'ER Notation Cheat Sheet','files/c2/er_notation.pdf',  '2026-08-06 10:00'),
(6,  N'Normalization Notes',    'files/c2/normalization.pdf','2026-08-06 10:30'),
(10, N'Limits Worksheet',       'files/c4/limits.pdf',       '2026-08-08 11:00');

INSERT INTO Enrollments (StudentID, CourseID, EnrolledAt, CompletedAt) VALUES
(4, 1, '2026-08-15 10:00', '2026-09-10 18:00'),
(4, 2, '2026-08-15 10:05', NULL),
(5, 1, '2026-08-16 09:00', NULL),
(5, 2, '2026-08-16 09:10', NULL),
(5, 3, '2026-08-16 09:20', NULL),
(6, 2, '2026-08-17 12:00', NULL),
(6, 4, '2026-08-17 12:10', NULL),
(7, 1, '2026-08-18 15:00', NULL),
(7, 4, '2026-08-18 15:10', NULL),
(8, 2, '2026-08-19 11:00', NULL),
(9, 2, '2026-08-20 13:00', NULL);

INSERT INTO LessonProgress (StudentID, LessonID, CompletedAt) VALUES
(4, 1, '2026-08-20'), (4, 2, '2026-08-25'), (4, 3, '2026-09-10'), (4, 4, '2026-08-21'), (4, 5, '2026-08-28'),
(5, 1, '2026-08-22'), (5, 4, '2026-08-20'), (5, 5, '2026-08-24'), (5, 6, '2026-09-01'), (5, 7, '2026-09-08'), (5, 8, '2026-08-30'),
(6, 4, '2026-08-23'), (6, 10, '2026-08-25'),
(7, 1, '2026-08-24'), (7, 2, '2026-09-02'), (7, 10, '2026-08-26'), (7, 11, '2026-09-05'),
(8, 4, '2026-08-22'), (8, 5, '2026-08-29'), (8, 6, '2026-09-06');

INSERT INTO Quizzes (CourseID, Title, TimeLimitMin, PassingMarks, CreatedAt) VALUES
(1, N'C++ Basics Quiz',     10, 2, '2026-08-25'),
(2, N'Normalization Quiz',  15, 3, '2026-09-02'),
(4, N'Limits Quiz',         10, 2, '2026-09-01');

INSERT INTO Questions (QuizID, QuestionText, Marks) VALUES
(1, N'Which data type stores whole numbers in C++?',          1),
(1, N'Which loop always runs at least once?',                 1),
(1, N'Which keyword sends a value back from a function?',     1),
(2, N'A table in 2NF has no ______ dependency.',              2),
(2, N'In BCNF every determinant must be a ______.',           2),
(2, N'1NF requires all column values to be ______.',          1),
(3, N'lim (x -> 0) sin(x)/x = ?',                             2),
(3, N'lim (x -> 2) (x + 3) = ?',                              1);

INSERT INTO QuestionOptions (QuestionID, OptionLabel, OptionText, IsCorrect) VALUES
(1, 'A', N'int', 1),        (1, 'B', N'float', 0),          (1, 'C', N'char', 0),        (1, 'D', N'bool', 0),
(2, 'A', N'for', 0),        (2, 'B', N'while', 0),          (2, 'C', N'do-while', 1),    (2, 'D', N'None of these', 0),
(3, 'A', N'return', 1),     (3, 'B', N'break', 0),          (3, 'C', N'exit', 0),        (3, 'D', N'void', 0),
(4, 'A', N'transitive', 0), (4, 'B', N'partial', 1),        (4, 'C', N'multivalued', 0), (4, 'D', N'join', 0),
(5, 'A', N'foreign key', 0),(5, 'B', N'candidate key', 1),  (5, 'C', N'non-key attribute', 0), (5, 'D', N'composite attribute', 0),
(6, 'A', N'atomic', 1),     (6, 'B', N'NULL', 0),           (6, 'C', N'duplicate', 0),   (6, 'D', N'derived', 0),
(7, 'A', N'0', 0),          (7, 'B', N'1', 1),              (7, 'C', N'Infinity', 0),    (7, 'D', N'Undefined', 0),
(8, 'A', N'2', 0),          (8, 'B', N'3', 0),              (8, 'C', N'5', 1),           (8, 'D', N'6', 0);

INSERT INTO QuizAttempts (QuizID, StudentID, StartedAt, SubmittedAt, Score) VALUES
(1, 4, '2026-08-26 10:00', '2026-08-26 10:07', 3),
(1, 5, '2026-08-26 11:00', '2026-08-26 11:09', 2),
(1, 7, '2026-08-27 09:00', '2026-08-27 09:10', 1),
(2, 4, '2026-09-03 14:00', '2026-09-03 14:12', 5),
(2, 5, '2026-09-03 15:00', '2026-09-03 15:14', 3),
(2, 6, '2026-09-04 10:00', '2026-09-04 10:15', 0),
(2, 8, '2026-09-05 16:00', '2026-09-05 16:11', NULL),
(3, 6, '2026-09-02 12:00', '2026-09-02 12:08', 3),
(3, 7, '2026-09-02 13:00', '2026-09-02 13:09', NULL);

INSERT INTO AttemptAnswers (AttemptID, QuestionID, OptionLabel) VALUES
(1, 1, 'A'), (1, 2, 'C'), (1, 3, 'A'),
(2, 1, 'A'), (2, 2, 'A'), (2, 3, 'A'),
(3, 1, 'B'), (3, 2, 'C'), (3, 3, 'B'),
(4, 4, 'B'), (4, 5, 'B'), (4, 6, 'A'),
(5, 4, 'A'), (5, 5, 'B'), (5, 6, 'A'),
(6, 4, 'A'), (6, 5, 'A'), (6, 6, 'B'),
(7, 4, 'B'), (7, 5, 'B'), (7, 6, 'B'),
(8, 7, 'B'), (8, 8, 'C'),
(9, 7, 'A'), (9, 8, 'C');

INSERT INTO Assignments (CourseID, Title, Instructions, DueDate, TotalMarks, CreatedAt) VALUES
(1, N'Loops Practice',          N'Solve the 5 loop problems and upload a .cpp file.',          '2026-09-20 23:59', 10, '2026-09-01'),
(2, N'ER Diagram for Library',  N'Draw an ER diagram for a library system and upload a PDF.',  '2026-09-25 23:59', 20, '2026-09-05'),
(2, N'Normalize to BCNF',       N'Normalize the given relation up to BCNF and show each step.','2026-10-05 23:59', 20, '2026-09-20'),
(4, N'Limits Worksheet',        N'Solve all questions of the limits worksheet.',               '2026-09-30 23:59', 10, '2026-09-10');

INSERT INTO Submissions (AssignmentID, StudentID, FilePath, SubmittedAt, MarksObtained, Feedback, GradedAt) VALUES
(1, 4, 'uploads/a1/ali_raza.cpp',     '2026-09-18 20:00', 9,    N'Great work, clean code.',      '2026-09-22 10:00'),
(1, 5, 'uploads/a1/fatima_noor.cpp',  '2026-09-21 09:30', 6,    N'Late submission, -2 marks.',   '2026-09-22 10:10'),
(1, 7, 'uploads/a1/zainab_iqbal.cpp', '2026-09-19 22:15', NULL, NULL, NULL),
(2, 4, 'uploads/a2/ali_raza.pdf',     '2026-09-24 18:00', 18,   N'Very neat diagram.',           '2026-09-28 11:00'),
(2, 5, 'uploads/a2/fatima_noor.pdf',  '2026-09-25 21:45', 15,   N'Missing cardinality on 2 relationships.', '2026-09-28 11:20'),
(2, 6, 'uploads/a2/hamza_tariq.pdf',  '2026-09-26 08:00', NULL, NULL, NULL),
(3, 4, 'uploads/a3/ali_raza.pdf',     '2026-10-04 19:30', NULL, NULL, NULL),
(4, 6, 'uploads/a4/hamza_tariq.pdf',  '2026-09-29 17:00', 8,    N'Good, check question 4 again.', '2026-10-02 09:00');

INSERT INTO Announcements (CourseID, Title, Message, PostedAt) VALUES
(2, N'Midterm Schedule',      N'The Database Systems midterm will be held on 15 October.', '2026-09-28 09:00'),
(1, N'Lab Shifted',           N'This week''s programming lab is shifted to Thursday.',     '2026-09-15 08:30'),
(2, N'Assignment 3 Posted',   N'The BCNF normalization assignment is now available.',      '2026-09-20 10:00'),
(4, N'Quiz 1 Results',        N'Results of the Limits Quiz are now visible in your panel.', '2026-09-03 17:00');
GO

SELECT t.name AS TableName, SUM(p.rows) AS TotalRows
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
GROUP BY t.name
ORDER BY t.name;
GO
