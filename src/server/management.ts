import { Role } from "@prisma/client";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "@/lib/db";
import {
  requireOwnership,
  requireRole,
  hashPassword,
  verifyPassword,
} from "@/lib/security";
import { passwordSchema } from "@/lib/validation";
import { invariant } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { lockAttempt } from "./attempts";
import { totals } from "@/lib/assessment";
type Actor = { id: string; role: Role };
export async function saveCourse(user: Actor, body: unknown) {
  requireRole(user.role, ["ADMIN"]);
  const input = z
    .object({
      name: z.string().trim().min(3).max(150),
      code: z.string().trim().min(2).max(20),
      description: z.string().max(2000).default(""),
      instructorId: z.string(),
    })
    .strict()
    .parse(body);
  const instructor = await db.user.findFirst({
    where: { id: input.instructorId, role: "INSTRUCTOR", status: "ACTIVE" },
  });
  invariant(instructor, 400, "Choose an active instructor.");
  return db.$transaction(async (tx) => {
    const course = await tx.course.create({ data: input });
    await createAuditLog(
      user.id,
      "COURSE_CREATED",
      "Course",
      course.id,
      {},
      tx,
    );
    return course;
  });
}
export async function enroll(user: Actor, body: unknown) {
  requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
  const input = z
    .object({
      courseId: z.string(),
      emails: z
        .array(z.email().transform((v) => v.toLowerCase()))
        .min(1)
        .max(500),
    })
    .strict()
    .parse(body);
  const course = await db.course.findUnique({ where: { id: input.courseId } });
  invariant(course, 404, "Course not found.");
  requireOwnership(user, course.instructorId);
  const students = await db.user.findMany({
    where: { email: { in: input.emails }, role: "STUDENT", status: "ACTIVE" },
    select: { id: true, email: true },
  });
  invariant(
    students.length === new Set(input.emails).size,
    400,
    "Every email must belong to an active student. No changes were made.",
  );
  return db.$transaction(async (tx) => {
    const result = await tx.enrollment.createMany({
      data: students.map((s) => ({ courseId: course.id, studentId: s.id })),
      skipDuplicates: true,
    });
    await createAuditLog(
      user.id,
      "STUDENTS_ENROLLED",
      "Course",
      course.id,
      { count: result.count },
      tx,
    );
    return result;
  });
}
export function parseEnrollmentCsv(content: string) {
  const parsed = Papa.parse<{ email: string }>(content, {
    header: true,
    skipEmptyLines: true,
  });
  invariant(!parsed.errors.length, 400, "Invalid enrollment CSV.");
  return z
    .array(z.email())
    .min(1)
    .max(500)
    .parse(parsed.data.map((row) => row.email?.trim().toLowerCase()));
}
export async function manageUser(user: Actor, body: unknown, id?: string) {
  requireRole(user.role, ["ADMIN"]);
  if (!id) {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().transform((v) => v.toLowerCase()),
        role: z.enum(["ADMIN", "INSTRUCTOR", "STUDENT"]),
        password: passwordSchema,
      })
      .strict()
      .parse(body);
    const { password, ...data } = input;
    return db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ...data,
          passwordHash: await hashPassword(password),
          emailVerifiedAt: new Date(),
        },
        select: { id: true, name: true, email: true, role: true, status: true },
      });
      await createAuditLog(user.id, "USER_CREATED", "User", created.id, {}, tx);
      return created;
    });
  }
  const input = z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      role: z.enum(["ADMIN", "INSTRUCTOR", "STUDENT"]).optional(),
      status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).optional(),
    })
    .strict()
    .parse(body);
  invariant(
    id !== user.id ||
      ((!input.role || input.role === "ADMIN") &&
        (!input.status || input.status === "ACTIVE")),
    400,
    "You cannot remove your own administrator access.",
  );
  return db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        ...input,
        ...(input.status === "ACTIVE"
          ? { lockedUntil: null, failedLogins: 0 }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    await tx.session.deleteMany({ where: { userId: id } });
    await createAuditLog(user.id, "USER_UPDATED", "User", id, { ...input }, tx);
    return updated;
  });
}
export async function updateProfile(user: Actor, body: unknown) {
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      currentPassword: z.string().optional(),
      newPassword: passwordSchema.optional(),
    })
    .strict()
    .parse(body);
  let passwordHash: string | undefined;
  if (input.newPassword) {
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    invariant(
      input.currentPassword &&
        (await verifyPassword(input.currentPassword, stored.passwordHash)),
      400,
      "Current password is incorrect.",
    );
    passwordHash = await hashPassword(input.newPassword);
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { name: input.name, ...(passwordHash ? { passwordHash } : {}) },
    });
    if (passwordHash)
      await tx.session.deleteMany({ where: { userId: user.id } });
    await createAuditLog(
      user.id,
      passwordHash ? "PASSWORD_CHANGED" : "PROFILE_UPDATED",
      "User",
      user.id,
      {},
      tx,
    );
  });
  return {
    message: passwordHash
      ? "Password updated. Sign in again on all devices."
      : "Profile saved.",
  };
}
export async function gradeSubmission(user: Actor, id: string, body: unknown) {
  requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
  const input = z
    .object({
      action: z.enum(["grade", "release", "reopen"]),
      answerId: z.string().optional(),
      points: z.number().min(0).max(1000).optional(),
      feedback: z.string().max(5000).default(""),
    })
    .strict()
    .parse(body);
  return db.$transaction(async (tx) => {
    await lockAttempt(tx, id);
    const a = await tx.examAttempt.findUnique({
      where: { id },
      include: {
        exam: true,
        result: true,
        questions: { include: { answer: { include: { grade: true } } } },
      },
    });
    invariant(a, 404, "Attempt not found.");
    requireOwnership(user, a.exam.instructorId);
    invariant(
      a.status !== "IN_PROGRESS",
      409,
      "Wait for submission before grading.",
    );
    if (input.action === "reopen") {
      await tx.result.update({
        where: { attemptId: id },
        data: { finalizedAt: null, releasedAt: null },
      });
      await tx.examAttempt.update({
        where: { id },
        data: { status: "SUBMITTED" },
      });
      await createAuditLog(
        user.id,
        "RESULT_REOPENED",
        "ExamAttempt",
        id,
        {},
        tx,
      );
      return {
        message: "Grading reopened. Results are hidden until released again.",
      };
    }
    if (input.action === "grade") {
      invariant(
        !a.result?.finalizedAt,
        409,
        "Reopen the finalized result before changing scores.",
      );
      const q = a.questions.find((q) => q.answer?.id === input.answerId);
      invariant(
        q?.answer && q.type === "ESSAY",
        400,
        "Select an essay answer.",
      );
      invariant(
        input.points !== undefined && input.points <= Number(q.points),
        400,
        "Points exceed the question maximum.",
      );
      await tx.grade.upsert({
        where: { answerId: q.answer.id },
        create: {
          answerId: q.answer.id,
          points: input.points,
          feedback: input.feedback,
          graderId: user.id,
        },
        update: {
          points: input.points,
          feedback: input.feedback,
          graderId: user.id,
        },
      });
      await createAuditLog(
        user.id,
        "MANUAL_GRADE",
        "Answer",
        q.answer.id,
        {
          previous: q.answer.grade ? Number(q.answer.grade.points) : null,
          points: input.points,
        },
        tx,
      );
    }
    const fresh = await tx.examAttempt.findUniqueOrThrow({
      where: { id },
      include: {
        questions: { include: { answer: { include: { grade: true } } } },
      },
    });
    const complete = fresh.questions.every((q) => q.answer?.grade);
    const score = totals(
      fresh.questions.map((q) => Number(q.answer?.grade?.points || 0)),
      fresh.questions.reduce((s, q) => s + Number(q.points), 0),
      a.exam.passingScore,
    );
    await tx.examAttempt.update({
      where: { id },
      data: { ...score, status: complete ? "GRADED" : "SUBMITTED" },
    });
    if (input.action === "release") {
      invariant(
        complete,
        409,
        "Grade all answers before releasing the result.",
      );
      await tx.result.update({
        where: { attemptId: id },
        data: { releasedAt: new Date(), finalizedAt: new Date() },
      });
      await tx.notification.create({
        data: {
          userId: a.studentId,
          title: "Your result is ready",
          message: `Your result for ${a.exam.title} is now available.`,
        },
      });
      await createAuditLog(
        user.id,
        "RESULT_RELEASED",
        "ExamAttempt",
        id,
        {},
        tx,
      );
    }
    return {
      message:
        input.action === "release"
          ? "Result finalized and released."
          : "Grade saved.",
    };
  });
}
