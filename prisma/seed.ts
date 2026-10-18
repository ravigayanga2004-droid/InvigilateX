import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security";
import {
  startAttempt,
  saveAnswer,
  submitAttempt,
} from "../src/server/attempts";
const db = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.SEED_DEMO !== "true")
    throw new Error(
      "Demo seeding requires SEED_DEMO=true in a non-production environment.",
    );
  const passwordHash = await hashPassword("Demo-ExamGuard-2026!");
  const users = await Promise.all(
    (
      [
        { email: "admin@example.test", name: "Alex Morgan", role: "ADMIN" },
        {
          email: "instructor@example.test",
          name: "Jordan Lee",
          role: "INSTRUCTOR",
        },
        {
          email: "student@example.test",
          name: "Taylor Quinn",
          role: "STUDENT",
        },
      ] as const
    ).map((u) =>
      db.user.upsert({
        where: { email: u.email },
        create: { ...u, passwordHash, emailVerifiedAt: new Date() },
        update: {},
      }),
    ),
  );
  const [admin, instructor, student] = users;
  const courses = [];
  for (const c of [
    {
      code: "CS101",
      name: "Computer Science Fundamentals",
      description:
        "Build strong foundations in computing, algorithms, and data.",
    },
    {
      code: "DB201",
      name: "Database Systems",
      description:
        "Explore relational design, consistency, and secure data management.",
    },
  ])
    courses.push(
      await db.course.upsert({
        where: { code: c.code },
        create: { ...c, instructorId: instructor.id },
        update: {},
      }),
    );
  for (const c of courses)
    await db.enrollment.upsert({
      where: { courseId_studentId: { courseId: c.id, studentId: student.id } },
      create: { courseId: c.id, studentId: student.id },
      update: {},
    });
  const bank = await db.questionBank.upsert({
    where: { id: "demo-bank" },
    create: {
      id: "demo-bank",
      title: "Computing essentials",
      instructorId: instructor.id,
    },
    update: {},
  });
  const definitions = [
    {
      id: "demo-q1",
      type: "SINGLE_CHOICE" as const,
      text: "Which data structure follows first-in, first-out order?",
      points: 2,
      explanation: "A queue serves elements in their arrival order.",
      options: [
        { text: "Queue", isCorrect: true },
        { text: "Stack", isCorrect: false },
        { text: "Binary tree", isCorrect: false },
        { text: "Hash set", isCorrect: false },
      ],
    },
    {
      id: "demo-q2",
      type: "MULTIPLE_CHOICE" as const,
      text: "Which of these are relational database constraints? Select all that apply.",
      points: 3,
      explanation:
        "PRIMARY KEY and FOREIGN KEY enforce entity and referential integrity.",
      options: [
        { text: "PRIMARY KEY", isCorrect: true },
        { text: "FOREIGN KEY", isCorrect: true },
        { text: "ORDER BY", isCorrect: false },
        { text: "SELECT", isCorrect: false },
      ],
    },
    {
      id: "demo-q3",
      type: "TRUE_FALSE" as const,
      text: "A database transaction can group several changes into one atomic operation.",
      points: 2,
      explanation:
        "Atomicity means all changes commit together or are rolled back.",
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
      ],
    },
    {
      id: "demo-q4",
      type: "SHORT_ANSWER" as const,
      text: "What does CPU stand for?",
      points: 3,
      correctText: "central processing unit",
      explanation: "CPU stands for central processing unit.",
      options: [],
    },
    {
      id: "demo-q5",
      type: "ESSAY" as const,
      text: "Explain how database normalization can improve data consistency. Include one example.",
      points: 5,
      explanation:
        "Credit a clear explanation of reduced redundancy, update anomalies, and an example.",
      options: [],
    },
  ];
  for (const q of definitions) {
    const { options, ...data } = q;
    await db.question.upsert({
      where: { id: q.id },
      create: {
        ...data,
        questionBankId: bank.id,
        difficulty: q.type === "ESSAY" ? "HARD" : "MEDIUM",
        topic: "Computing",
        tags: ["fundamentals"],
        options: { create: options.map((o, position) => ({ ...o, position })) },
      },
      update: {},
    });
  }
  for (const [i, e] of [
    {
      id: "demo-exam-1",
      title: "Computing Foundations — Assessment 01",
      course: courses[0],
      questions: definitions.slice(0, 4),
      status: "PUBLISHED" as const,
    },
    {
      id: "demo-exam-2",
      title: "Data & Design — Written Assessment",
      course: courses[1],
      questions: [definitions[1], definitions[2], definitions[4]],
      status: "DRAFT" as const,
    },
  ].entries()) {
    await db.exam.upsert({
      where: { id: e.id },
      create: {
        id: e.id,
        title: e.title,
        description:
          i === 0
            ? "Put your computing knowledge into practice."
            : "Reason about the decisions behind reliable data systems.",
        instructions:
          "Read each question carefully. Work independently. You may use blank paper for notes. All answers save automatically. Multiple-choice questions use partial credit with a penalty for incorrect selections.",
        courseId: e.course.id,
        instructorId: instructor.id,
        status: e.status,
        durationSeconds: 1800,
        startAt: new Date(Date.now() - 86400000),
        endAt: new Date(Date.now() + 30 * 86400000),
        maxAttempts: 2,
        passingScore: 50,
        showResultsImmediately: true,
        showCorrectAnswers: true,
        publishedAt: i === 0 ? new Date() : null,
        settings: { create: {} },
        questions: {
          create: e.questions.map((q, position) => ({
            questionId: q.id,
            position,
            points: q.points,
          })),
        },
      },
      update: {},
    });
  }
  if (
    !(await db.examAttempt.count({
      where: { examId: "demo-exam-1", studentId: student.id },
    }))
  ) {
    const attempt = await startAttempt(student.id, "demo-exam-1");
    const questions = await db.attemptQuestion.findMany({
      where: { attemptId: attempt.id },
    });
    for (const q of questions)
      await saveAnswer(student.id, attempt.id, {
        questionId: q.id,
        text: q.type === "SHORT_ANSWER" ? "central processing unit" : "",
        optionIds: q.type === "SHORT_ANSWER" ? [] : q.correctOptionIds,
        revision: 1,
      });
    await db.antiCheatEvent.create({
      data: {
        attemptId: attempt.id,
        studentId: student.id,
        eventType: "TAB_HIDDEN",
        severity: 2,
      },
    });
    await submitAttempt(student.id, attempt.id);
  }
  for (const u of users)
    if (!(await db.notification.count({ where: { userId: u.id } })))
      await db.notification.create({
        data: {
          userId: u.id,
          title: "Welcome to your workspace",
          message:
            "Your demo workspace is ready. Explore your exams, courses, and results.",
        },
      });
  if (!(await db.auditLog.count({ where: { action: "DEMO_SEEDED" } })))
    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "DEMO_SEEDED",
        entityType: "Platform",
        entityId: "demo",
      },
    });
  console.info(
    "Synthetic demo accounts ready: admin@example.test, instructor@example.test, student@example.test. Password: Demo-ExamGuard-2026!",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
