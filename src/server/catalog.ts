import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { requireOwnership, requireRole } from "@/lib/security";
import { createAuditLog } from "@/lib/audit";
import { examSchema, questionSchema } from "@/lib/validation";
type Actor = { id: string; role: Role };
export function examScope(user: Actor): Prisma.ExamWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "INSTRUCTOR") return { instructorId: user.id };
  return {
    status: "PUBLISHED",
    OR: [
      { course: { enrollments: { some: { studentId: user.id } } } },
      { assignments: { some: { studentId: user.id } } },
    ],
  };
}
export async function ownedExam(user: Actor, id: string) {
  const exam = await db.exam.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { position: "asc" },
        include: { question: { include: { options: true } } },
      },
      settings: true,
    },
  });
  invariant(exam, 404, "Exam not found.");
  requireOwnership(user, exam.instructorId);
  return exam;
}
export async function saveExam(user: Actor, body: unknown, id?: string) {
  requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
  const input = examSchema.parse(body);
  const course = await db.course.findUnique({ where: { id: input.courseId } });
  invariant(course, 404, "Course not found.");
  requireOwnership(user, course.instructorId);
  const questions = await db.question.findMany({
    where: {
      id: { in: input.questions.map((q) => q.questionId) },
      isActive: true,
    },
    include: { questionBank: true },
  });
  invariant(
    questions.length === input.questions.length,
    400,
    "Some questions are missing or inactive.",
  );
  questions.forEach((q) => requireOwnership(user, q.questionBank.instructorId));
  const { questions: entries, integrityEnabled, ...data } = input;
  return db.$transaction(async (tx) => {
    if (id) {
      await tx.$queryRaw`SELECT id FROM "Exam" WHERE id=${id} FOR UPDATE`;
      const previous = await tx.exam.findUnique({ where: { id } });
      invariant(previous, 404, "Exam not found.");
      requireOwnership(user, previous.instructorId);
      invariant(
        previous.status === "DRAFT" &&
          (await tx.examAttempt.count({ where: { examId: id } })) === 0,
        409,
        "Only drafts without attempts can be edited. Duplicate this exam for a new version.",
      );
      await tx.examQuestion.deleteMany({ where: { examId: id } });
    }
    const common = {
      ...data,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      questions: { create: entries.map((q, position) => ({ ...q, position })) },
      settings: {
        [id ? "upsert" : "create"]: id
          ? { create: { integrityEnabled }, update: { integrityEnabled } }
          : { integrityEnabled },
      },
    };
    // Explicit branches retain Prisma's generated nested-write types.
    const exam = id
      ? await tx.exam.update({
          where: { id },
          data: {
            ...data,
            startAt: new Date(data.startAt),
            endAt: new Date(data.endAt),
            questions: common.questions,
            settings: {
              upsert: {
                create: { integrityEnabled },
                update: { integrityEnabled },
              },
            },
          },
        })
      : await tx.exam.create({
          data: {
            ...data,
            startAt: new Date(data.startAt),
            endAt: new Date(data.endAt),
            instructorId: course.instructorId,
            questions: common.questions,
            settings: { create: { integrityEnabled } },
          },
        });
    await createAuditLog(
      user.id,
      id ? "EXAM_UPDATED" : "EXAM_CREATED",
      "Exam",
      exam.id,
      {},
      tx,
    );
    return exam;
  });
}
export async function changeExamStatus(
  user: Actor,
  id: string,
  action: string,
) {
  const original = await ownedExam(user, id);
  if (action === "duplicate") {
    return saveExam(user, {
      title: original.title + " (copy)",
      description: original.description,
      instructions: original.instructions,
      courseId: original.courseId,
      durationSeconds: original.durationSeconds,
      startAt: original.startAt.toISOString(),
      endAt: original.endAt.toISOString(),
      maxAttempts: original.maxAttempts,
      passingScore: original.passingScore,
      randomizeQuestions: original.randomizeQuestions,
      randomizeOptions: original.randomizeOptions,
      showResultsImmediately: original.showResultsImmediately,
      showCorrectAnswers: original.showCorrectAnswers,
      allowResume: original.allowResume,
      requireFullscreen: original.requireFullscreen,
      integrityEnabled: original.settings?.integrityEnabled ?? true,
      questions: original.questions.map((q) => ({
        questionId: q.questionId,
        points: Number(q.points),
      })),
    });
  }
  invariant(
    ["publish", "unpublish", "archive"].includes(action),
    400,
    "Unknown exam action.",
  );
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Exam" WHERE id=${id} FOR UPDATE`;
    const exam = await tx.exam.findUniqueOrThrow({
      where: { id },
      include: { questions: true },
    });
    invariant(
      (await tx.examAttempt.count({
        where: { examId: id, status: "IN_PROGRESS" },
      })) === 0,
      409,
      "An active attempt prevents this change.",
    );
    if (action === "publish") {
      invariant(
        exam.questions.length > 0,
        400,
        "Add at least one question before publishing.",
      );
      invariant(
        exam.endAt > new Date(),
        400,
        "Update the availability window before publishing.",
      );
    }
    const updated = await tx.exam.update({
      where: { id },
      data: {
        status:
          action === "publish"
            ? "PUBLISHED"
            : action === "archive"
              ? "ARCHIVED"
              : "DRAFT",
        ...(action === "publish" ? { publishedAt: new Date() } : {}),
      },
    });
    await createAuditLog(
      user.id,
      "EXAM_" + action.toUpperCase(),
      "Exam",
      id,
      {},
      tx,
    );
    return updated;
  });
}
export async function createQuestion(user: Actor, body: unknown) {
  requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
  const input = questionSchema.parse(body);
  const bank = await db.questionBank.findUnique({
    where: { id: input.questionBankId },
  });
  invariant(bank, 404, "Question bank not found.");
  requireOwnership(user, bank.instructorId);
  const { options, ...data } = input;
  return db.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        ...data,
        options: { create: options.map((o, position) => ({ ...o, position })) },
      },
    });
    await createAuditLog(
      user.id,
      "QUESTION_CREATED",
      "Question",
      question.id,
      {},
      tx,
    );
    return question;
  });
}
export function parseImport(format: string, content: string, bankId: string) {
  let rows: unknown[];
  if (format === "csv") {
    const csv = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });
    invariant(
      !csv.errors.length,
      400,
      "Invalid CSV: " + csv.errors.map((e) => e.message).join(", "),
    );
    rows = csv.data.map((row) => ({
      ...row,
      points: Number(row.points || 1),
      tags: row.tags ? row.tags.split("|") : [],
      options: row.options ? JSON.parse(row.options) : [],
      questionBankId: bankId,
      correctText: row.correctText || null,
    }));
  } else {
    const value = JSON.parse(content);
    invariant(
      Array.isArray(value),
      400,
      "JSON must contain an array of questions.",
    );
    rows = value.map((row) => ({ ...row, questionBankId: bankId }));
  }
  invariant(
    rows.length > 0 && rows.length <= 200,
    400,
    "Import between 1 and 200 questions.",
  );
  return rows.map((row, index) => {
    const parsed = questionSchema.safeParse(row);
    return {
      row: index + 1,
      data: parsed.success ? parsed.data : null,
      errors: parsed.success ? [] : parsed.error.issues.map((i) => i.message),
    };
  });
}
export async function importQuestions(user: Actor, body: unknown) {
  requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
  const input = z
    .object({
      format: z.enum(["csv", "json"]),
      content: z.string().max(500000),
      bankId: z.string(),
      confirm: z.boolean().default(false),
    })
    .strict()
    .parse(body);
  const bank = await db.questionBank.findUnique({
    where: { id: input.bankId },
  });
  invariant(bank, 404, "Question bank not found.");
  requireOwnership(user, bank.instructorId);
  let preview;
  try {
    preview = parseImport(input.format, input.content, input.bankId);
  } catch (error) {
    invariant(
      false,
      400,
      error instanceof Error ? error.message : "Invalid import file.",
    );
  }
  if (!input.confirm) return { preview };
  invariant(
    preview.every((r) => r.data),
    400,
    "Fix every invalid row before importing.",
  );
  await db.$transaction(async (tx) => {
    for (const row of preview) {
      const { options, ...data } = row.data!;
      await tx.question.create({
        data: {
          ...data,
          options: {
            create: options.map((o, position) => ({ ...o, position })),
          },
        },
      });
    }
    await createAuditLog(
      user.id,
      "QUESTIONS_IMPORTED",
      "QuestionBank",
      bank.id,
      { count: preview.length },
      tx,
    );
  });
  return { imported: preview.length };
}
