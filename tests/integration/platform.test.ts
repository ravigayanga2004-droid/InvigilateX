import "dotenv/config";
import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth", () => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
}));
// Only a dedicated disposable database may be migrated or cleared by this suite.
const testUrl =
  process.env.TEST_DATABASE_URL ||
  "postgresql://examguard:examguard_local@localhost:54329/examguard_test?schema=public";
if (!new URL(testUrl).pathname.endsWith("/examguard_test"))
  throw new Error("Integration tests require a database named examguard_test.");
process.env.DATABASE_URL = testUrl;
const { db } = await import("../../src/lib/db");
const { hashPassword, rateLimit } = await import("../../src/lib/security");
const {
  startAttempt,
  saveAnswer,
  submitAttempt,
  fetchAttempt,
  expireAttempts,
} = await import("../../src/server/attempts");
const { saveExam, createQuestion, importQuestions, changeExamStatus } =
  await import("../../src/server/catalog");
const { saveCourse, enroll, gradeSubmission, manageUser } =
  await import("../../src/server/management");
const { createAuditLog } = await import("../../src/lib/audit");
const { resetPassword } = await import("../../src/server/accounts");
const { digest } = await import("../../src/lib/security");
let admin: { id: string; role: "ADMIN" },
  teacher: { id: string; role: "INSTRUCTOR" },
  other: { id: string; role: "INSTRUCTOR" },
  student: { id: string; role: "STUDENT" },
  stranger: { id: string; role: "STUDENT" };
let courseId: string, bankId: string, examId: string, attemptId: string;
let questionIds: string[] = [];
beforeAll(async () => {
  const cli = "node_modules/prisma/build/index.js";
  execFileSync(process.execPath, [cli, "migrate", "deploy"], {
    env: process.env,
    stdio: "pipe",
  });
  // Reset only the explicitly dedicated test schema, never developer or production records.
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Course", "QuestionBank", "Exam", "RateLimit", "PlatformSetting" RESTART IDENTITY CASCADE',
  );
  const passwordHash = await hashPassword("Test-ExamGuard-2026!");
  const created = await Promise.all(
    (
      [
        { name: "Test Admin", email: "a@test.invalid", role: "ADMIN" },
        {
          name: "Test Instructor",
          email: "i@test.invalid",
          role: "INSTRUCTOR",
        },
        {
          name: "Other Instructor",
          email: "o@test.invalid",
          role: "INSTRUCTOR",
        },
        { name: "Test Student", email: "s@test.invalid", role: "STUDENT" },
        { name: "Other Student", email: "x@test.invalid", role: "STUDENT" },
      ] as const
    ).map((u) => db.user.create({ data: { ...u, passwordHash } })),
  );
  [admin, teacher, other, student, stranger] = created as unknown as [
    typeof admin,
    typeof teacher,
    typeof other,
    typeof student,
    typeof stranger,
  ];
});
afterAll(() => db.$disconnect());
describe("complete secure examination lifecycle", () => {
  it("creates courses and atomically enrolls only active students", async () => {
    const course = await saveCourse(admin, {
      name: "Integration Computing",
      code: "IT101",
      instructorId: teacher.id,
    });
    courseId = course.id;
    await expect(
      enroll(other, { courseId, emails: ["s@test.invalid"] }),
    ).rejects.toThrow();
    await expect(
      enroll(teacher, {
        courseId,
        emails: ["s@test.invalid", "missing@test.invalid"],
      }),
    ).rejects.toThrow();
    expect(await db.enrollment.count()).toBe(0);
    await enroll(teacher, { courseId, emails: ["s@test.invalid"] });
    expect(await db.enrollment.count()).toBe(1);
  });
  it("validates imports without partial writes", async () => {
    const bank = await db.questionBank.create({
      data: { title: "Test bank", instructorId: teacher.id },
    });
    bankId = bank.id;
    const content = JSON.stringify([
      { type: "ESSAY", text: "Explain atomicity.", points: 5 },
      { type: "SINGLE_CHOICE", text: "Invalid choices?", points: 1 },
    ]);
    const preview = await importQuestions(teacher, {
      bankId,
      format: "json",
      content,
    });
    expect(preview.preview?.[1].errors.length).toBeGreaterThan(0);
    await expect(
      importQuestions(teacher, {
        bankId,
        format: "json",
        content,
        confirm: true,
      }),
    ).rejects.toThrow();
    expect(await db.question.count()).toBe(0);
    await importQuestions(teacher, {
      bankId,
      format: "json",
      content: JSON.stringify([
        { type: "ESSAY", text: "Explain atomicity.", points: 5 },
      ]),
      confirm: true,
    });
    expect(await db.question.count()).toBe(1);
  });
  it("creates objective questions and publishes instructor-owned exams", async () => {
    const q = await createQuestion(teacher, {
      questionBankId: bankId,
      type: "SINGLE_CHOICE",
      text: "Which answer is correct?",
      points: 2,
      options: [
        { text: "Correct", isCorrect: true },
        { text: "Incorrect", isCorrect: false },
      ],
    });
    questionIds = [q.id];
    const exam = await saveExam(teacher, {
      title: "Integration assessment",
      courseId,
      durationSeconds: 120,
      startAt: new Date(Date.now() - 10000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
      maxAttempts: 1,
      passingScore: 50,
      showResultsImmediately: false,
      questions: [{ questionId: q.id, points: 2 }],
    });
    examId = exam.id;
    await expect(changeExamStatus(other, examId, "publish")).rejects.toThrow();
    await expect(
      changeExamStatus({ id: teacher.id, role: "STUDENT" }, examId, "publish"),
    ).rejects.toThrow();
    await changeExamStatus(teacher, examId, "publish");
    await expect(
      saveExam(other, {
        title: "Unrelated assessment",
        courseId,
        durationSeconds: 120,
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 100000).toISOString(),
        maxAttempts: 1,
        passingScore: 50,
        questions: [],
      }),
    ).rejects.toThrow();
  });
  it("denies unassigned students and serializes simultaneous starts", async () => {
    await expect(startAttempt(stranger.id, examId)).rejects.toThrow();
    const [a, b] = await Promise.all([
      startAttempt(student.id, examId),
      startAttempt(student.id, examId),
    ]);
    expect(a.id).toBe(b.id);
    attemptId = a.id;
    expect(await db.examAttempt.count({ where: { examId } })).toBe(1);
  });
  it("never leaks correct answers and blocks cross-student access", async () => {
    const a = await fetchAttempt(student, attemptId);
    const json = JSON.stringify(a);
    expect(json).not.toContain("correctOptionIds");
    expect(json).not.toContain("correctText");
    expect(json).not.toContain("explanation");
    expect(json).not.toContain('"seed"');
    await expect(fetchAttempt(stranger, attemptId)).rejects.toThrow();
    await expect(fetchAttempt(other, attemptId)).rejects.toThrow();
    expect(await fetchAttempt(teacher, attemptId)).toHaveProperty(
      "questions.0.correctOptionIds",
    );
  });
  it("validates question membership and options and preserves monotonic autosaves", async () => {
    const q = await db.attemptQuestion.findFirstOrThrow({
      where: { attemptId },
    });
    await expect(
      saveAnswer(student.id, attemptId, {
        questionId: "unassigned",
        text: "",
        optionIds: [],
        revision: 1,
      }),
    ).rejects.toThrow();
    await expect(
      saveAnswer(student.id, attemptId, {
        questionId: q.id,
        text: "",
        optionIds: ["invented"],
        revision: 1,
      }),
    ).rejects.toThrow();
    await saveAnswer(student.id, attemptId, {
      questionId: q.id,
      text: "",
      optionIds: q.correctOptionIds,
      revision: 3,
    });
    await saveAnswer(student.id, attemptId, {
      questionId: q.id,
      text: "",
      optionIds: [],
      revision: 2,
    });
    const refreshed = await fetchAttempt(student, attemptId);
    expect(refreshed.questions[0].answer?.optionIds).toEqual(
      q.correctOptionIds,
    );
    expect(refreshed.questions[0].answer?.revision).toBe(3);
    await expect(
      changeExamStatus(teacher, examId, "unpublish"),
    ).rejects.toThrow();
  });
  it("submits idempotently, grades on the server and enforces result release", async () => {
    await Promise.all([
      submitAttempt(student.id, attemptId),
      submitAttempt(student.id, attemptId),
    ]);
    expect(await db.result.count({ where: { attemptId } })).toBe(1);
    const stored = await db.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    expect(Number(stored.percentage)).toBe(100);
    expect((await fetchAttempt(student, attemptId)).percentage).toBeNull();
    await gradeSubmission(teacher, attemptId, { action: "release" });
    expect(Number((await fetchAttempt(student, attemptId)).percentage)).toBe(
      100,
    );
    await expect(startAttempt(student.id, examId)).rejects.toThrow(
      "attempt limit",
    );
    const q = await db.attemptQuestion.findFirstOrThrow({
      where: { attemptId },
    });
    await expect(
      saveAnswer(student.id, attemptId, {
        questionId: q.id,
        text: "",
        optionIds: [],
        revision: 4,
      }),
    ).rejects.toThrow();
  });
  it("persists auto-submission before rejecting an expired answer", async () => {
    const e = await db.exam.create({
      data: {
        title: "Expiry assessment",
        courseId,
        instructorId: teacher.id,
        status: "PUBLISHED",
        durationSeconds: 60,
        startAt: new Date(Date.now() - 10000),
        endAt: new Date(Date.now() + 3600000),
        questions: {
          create: { questionId: questionIds[0], position: 0, points: 2 },
        },
      },
    });
    const a = await startAttempt(student.id, e.id);
    await db.examAttempt.update({
      where: { id: a.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const q = await db.attemptQuestion.findFirstOrThrow({
      where: { attemptId: a.id },
    });
    await expect(
      saveAnswer(student.id, a.id, {
        questionId: q.id,
        text: "",
        optionIds: q.correctOptionIds,
        revision: 1,
      }),
    ).rejects.toThrow("expired");
    expect(
      (await db.examAttempt.findUniqueOrThrow({ where: { id: a.id } })).status,
    ).toBe("GRADED");
    expect(
      await db.antiCheatEvent.count({
        where: { attemptId: a.id, eventType: "AUTO_SUBMIT" },
      }),
    ).toBe(1);
    expect(
      Number(
        (await db.examAttempt.findUniqueOrThrow({ where: { id: a.id } })).score,
      ),
    ).toBe(0);
    expect(await expireAttempts()).toBe(0);
  });
  it("requires audited reopen before changing finalized essay scores", async () => {
    const q = await db.question.findFirstOrThrow({ where: { type: "ESSAY" } });
    const e = await db.exam.create({
      data: {
        title: "Essay assessment",
        courseId,
        instructorId: teacher.id,
        status: "PUBLISHED",
        durationSeconds: 600,
        startAt: new Date(Date.now() - 10000),
        endAt: new Date(Date.now() + 3600000),
        questions: { create: { questionId: q.id, position: 0, points: 5 } },
      },
    });
    const a = await startAttempt(student.id, e.id);
    await submitAttempt(student.id, a.id);
    const answer = await db.answer.findFirstOrThrow({
      where: { attemptQuestion: { attemptId: a.id } },
    });
    await gradeSubmission(teacher, a.id, {
      action: "grade",
      answerId: answer.id,
      points: 3.5,
      feedback: "Good reasoning",
    });
    await gradeSubmission(teacher, a.id, { action: "release" });
    await expect(
      gradeSubmission(teacher, a.id, {
        action: "grade",
        answerId: answer.id,
        points: 5,
      }),
    ).rejects.toThrow("Reopen");
    await gradeSubmission(teacher, a.id, { action: "reopen" });
    expect((await fetchAttempt(student, a.id)).percentage).toBeNull();
    await gradeSubmission(teacher, a.id, {
      action: "grade",
      answerId: answer.id,
      points: 4,
    });
    expect(await db.auditLog.count({ where: { action: "MANUAL_GRADE" } })).toBe(
      2,
    );
  });
  it("atomically rate limits repeated requests", async () => {
    await rateLimit("integration-key", 2);
    await rateLimit("integration-key", 2);
    await expect(rateLimit("integration-key", 2)).rejects.toThrow("Too many");
  });
  it("audits without answer or password contents and rejects student role escalation", async () => {
    await expect(
      manageUser(student, { role: "ADMIN" }, student.id),
    ).rejects.toThrow();
    const log = await createAuditLog(
      admin.id,
      "SECURITY_TEST",
      "Platform",
      "test",
      { test: true },
    );
    expect(log.actorId).toBe(admin.id);
    expect(JSON.stringify(log)).not.toContain("passwordHash");
  });
  it("consumes recovery tokens exactly once and revokes sessions", async () => {
    const raw = "a".repeat(64);
    await db.passwordResetToken.create({
      data: {
        id: digest(raw),
        userId: stranger.id,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await db.session.create({
      data: {
        id: "test-session",
        userId: stranger.id,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const results = await Promise.allSettled([
      resetPassword({ token: raw, password: "New-Test-Password-2026!" }),
      resetPassword({ token: raw, password: "Another-Password-2026!" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(await db.session.count({ where: { userId: stranger.id } })).toBe(0);
  });
});
