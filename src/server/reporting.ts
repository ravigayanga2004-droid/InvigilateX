import { Role, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { analytics, riskSummary } from "@/lib/assessment";
import { examScope } from "./catalog";
import { invariant } from "@/lib/errors";
export async function dashboard(user: { id: string; role: Role }) {
  const scope = examScope(user);
  const where: Prisma.ExamAttemptWhereInput =
    user.role === "STUDENT"
      ? { studentId: user.id }
      : user.role === "INSTRUCTOR"
        ? { exam: { instructorId: user.id } }
        : {};
  const [exams, attempts, courses, activity] = await Promise.all([
    db.exam.findMany({
      where: scope,
      include: {
        course: true,
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { startAt: "asc" },
      take: 50,
    }),
    db.examAttempt.findMany({
      where,
      include: {
        exam: { select: { title: true } },
        student: { select: { name: true } },
        result: true,
        _count: { select: { events: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 200,
    }),
    db.course.count({
      where:
        user.role === "ADMIN"
          ? {}
          : user.role === "INSTRUCTOR"
            ? { instructorId: user.id }
            : { enrollments: { some: { studentId: user.id } } },
    }),
    user.role === "ADMIN"
      ? db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          include: { actor: { select: { name: true } } },
        })
      : db.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 6,
        }),
  ]);
  const visible = attempts.filter(
    (a) =>
      a.status === "GRADED" &&
      (user.role !== "STUDENT" || a.result?.releasedAt),
  );
  const stats = analytics(visible.map((a) => Number(a.percentage)));
  return {
    exams,
    attempts: attempts.map((a) => ({
      id: a.id,
      examId: a.examId,
      title: a.exam.title,
      student: a.student.name,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      percentage:
        user.role !== "STUDENT" || a.result?.releasedAt ? a.percentage : null,
      released: !!a.result?.releasedAt,
      events: a._count.events,
    })),
    courses,
    activity,
    stats,
    passRate: visible.length
      ? (visible.filter((a) => a.passed).length / visible.length) * 100
      : 0,
    completionRate: attempts.length
      ? (attempts.filter((a) => a.status !== "IN_PROGRESS").length /
          attempts.length) *
        100
      : 0,
  };
}
export async function integrity(
  user: { id: string; role: Role },
  attemptId?: string,
) {
  invariant(user.role !== "STUDENT", 403, "Instructor access is required.");
  const attempts = await db.examAttempt.findMany({
    where: {
      ...(user.role === "ADMIN" ? {} : { exam: { instructorId: user.id } }),
      ...(attemptId ? { id: attemptId } : {}),
    },
    include: {
      student: { select: { name: true } },
      exam: { select: { title: true } },
      events: { orderBy: { occurredAt: "asc" } },
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  return attempts.map((a) => ({
    id: a.id,
    title: a.exam.title,
    student: a.student.name,
    status: a.status,
    events: a.events,
    summary: riskSummary(a.events),
  }));
}
export function csvEscape(value: unknown) {
  let text = String(value ?? "");
  if (/^(?:\s*[=+\-@]|[\t\r\n])/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function listAttempts(
  user: { id: string; role: Role },
  page: number,
  query: string,
) {
  const scope: Prisma.ExamAttemptWhereInput =
    user.role === "STUDENT"
      ? { studentId: user.id }
      : user.role === "INSTRUCTOR"
        ? { exam: { instructorId: user.id } }
        : {};
  const where: Prisma.ExamAttemptWhereInput = {
    AND: [
      scope,
      ...(query
        ? [
            {
              exam: {
                title: { contains: query, mode: "insensitive" as const },
              },
            },
          ]
        : []),
    ],
  };
  const [rows, total] = await Promise.all([
    db.examAttempt.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * 25,
      take: 25,
      include: {
        exam: { select: { title: true } },
        student: { select: { name: true } },
        result: true,
        _count: { select: { events: true } },
      },
    }),
    db.examAttempt.count({ where }),
  ]);
  return {
    total,
    items: rows.map((a) => ({
      id: a.id,
      examId: a.examId,
      title: a.exam.title,
      student: a.student.name,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      percentage:
        user.role !== "STUDENT" || a.result?.releasedAt ? a.percentage : null,
      released: !!a.result?.releasedAt,
      events: a._count.events,
    })),
  };
}
