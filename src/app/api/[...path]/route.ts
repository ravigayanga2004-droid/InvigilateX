import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser, requireAuth, destroySession } from "@/lib/auth";
import {
  checkOrigin,
  rateLimit,
  requireRole,
  requireOwnership,
} from "@/lib/security";
import { errorResponse, invariant } from "@/lib/errors";
import { answerSchema, eventSchema } from "@/lib/validation";
import {
  login,
  register,
  forgotPassword,
  resetPassword,
  verifyEmail,
} from "@/server/accounts";
import {
  examScope,
  ownedExam,
  saveExam,
  changeExamStatus,
  createQuestion,
  importQuestions,
} from "@/server/catalog";
import {
  saveCourse,
  enroll,
  parseEnrollmentCsv,
  manageUser,
  updateProfile,
  gradeSubmission,
} from "@/server/management";
import {
  startAttempt,
  fetchAttempt,
  saveAnswer,
  submitAttempt,
  expireAttempts,
  lockAttempt,
} from "@/server/attempts";
import { dashboard, integrity, csvEscape } from "@/server/reporting";
import { createAuditLog } from "@/lib/audit";
import { assessmentInsights } from "@/server/insights";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const route = path.join("/");
    const method = request.method;
    const url = new URL(request.url);
    const mutation = method !== "GET";
    if (mutation) checkOrigin(request);
    if (route === "health") return Response.json({ status: "ok" });
    if (route === "ready") {
      await db.$queryRaw`SELECT 1`;
      return Response.json({ status: "ready" });
    }
    if (route === "institution" && method === "GET") {
      const settings = await db.platformSetting.findMany({
        where: {
          key: { in: ["institutionName", "supportEmail", "integrityNotice"] },
        },
      });
      return Response.json(
        Object.fromEntries(settings.map((s) => [s.key, s.value])),
      );
    }
    if (route === "cron/expire") {
      invariant(
        method === "GET" &&
          request.headers.get("authorization") ===
            `Bearer ${process.env.CRON_SECRET}` &&
          !!process.env.CRON_SECRET,
        401,
        "Unauthorized.",
      );
      return Response.json({ processed: await expireAttempts() });
    }
    let body: unknown = {};
    if (mutation) {
      invariant(
        Number(request.headers.get("content-length") || 0) < 1000000,
        413,
        "Request is too large.",
      );
      const raw = await request.text();
      invariant(Buffer.byteLength(raw) < 1000000, 413, "Request is too large.");
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        invariant(false, 400, "Invalid JSON.");
      }
    }
    if (method === "POST" && route.startsWith("auth/")) {
      const result =
        route === "auth/login"
          ? await login(request, body)
          : route === "auth/register"
            ? await register(request, body)
            : route === "auth/forgot-password"
              ? await forgotPassword(request, body)
              : route === "auth/reset-password"
                ? await resetPassword(body)
                : route === "auth/verify-email"
                  ? await verifyEmail(body)
                  : route === "auth/logout"
                    ? await destroySession()
                    : null;
      invariant(result !== null, 404, "Route not found.");
      return Response.json(result || { ok: true });
    }
    if (route === "session" && method === "GET")
      return Response.json({
        user: await currentUser(),
        registrationEnabled: process.env.ALLOW_REGISTRATION === "true",
      });
    const user = await requireAuth();
    if (mutation) await rateLimit("mutation:" + user.id, 600, 60);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(url.searchParams.get("page") || 1);
    const skip = (page - 1) * 25;
    const query = (url.searchParams.get("q") || "").slice(0, 100);
    if (method === "GET") {
      if (route === "insights")
        return Response.json(await assessmentInsights(user));
      if (route === "dashboard") return Response.json(await dashboard(user));
      if (route === "exams") {
        const where = {
          ...examScope(user),
          ...(query
            ? { title: { contains: query, mode: "insensitive" as const } }
            : {}),
        };
        const [items, total] = await Promise.all([
          db.exam.findMany({
            where,
            include: {
              course: true,
              _count: { select: { questions: true, attempts: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: 25,
          }),
          db.exam.count({ where }),
        ]);
        return Response.json({ items, total, page });
      }
      if (path[0] === "exams" && path.length === 2) {
        if (user.role !== "STUDENT")
          return Response.json(await ownedExam(user, path[1]));
        const exam = await db.exam.findFirst({
          where: { AND: [{ id: path[1] }, examScope(user)] },
          include: {
            course: true,
            _count: { select: { questions: true } },
            settings: true,
          },
        });
        invariant(exam, 404, "Exam not found.");
        return Response.json(exam);
      }
      if (path[0] === "attempts" && path.length === 2)
        return Response.json(await fetchAttempt(user, path[1]));
      if (route === "courses") {
        const where =
          user.role === "ADMIN"
            ? {}
            : user.role === "INSTRUCTOR"
              ? { instructorId: user.id }
              : { enrollments: { some: { studentId: user.id } } };
        return Response.json(
          await db.course.findMany({
            where,
            include: {
              instructor: { select: { name: true } },
              _count: { select: { enrollments: true, exams: true } },
            },
            orderBy: { name: "asc" },
          }),
        );
      }
      if (route === "people") {
        requireRole(user.role, ["ADMIN"]);
        return Response.json(
          await db.user.findMany({
            where: {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
              lastLoginAt: true,
            },
            orderBy: { name: "asc" },
            skip,
            take: 25,
          }),
        );
      }
      if (route === "instructors") {
        requireRole(user.role, ["ADMIN"]);
        return Response.json(
          await db.user.findMany({
            where: { role: "INSTRUCTOR", status: "ACTIVE" },
            select: { id: true, name: true },
          }),
        );
      }
      if (route === "banks") {
        requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
        return Response.json(
          await db.questionBank.findMany({
            where: user.role === "ADMIN" ? {} : { instructorId: user.id },
            include: { _count: { select: { questions: true } } },
            orderBy: { title: "asc" },
          }),
        );
      }
      if (route === "questions") {
        requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
        const bankId = url.searchParams.get("bankId");
        return Response.json(
          await db.question.findMany({
            where: {
              isActive: true,
              ...(bankId ? { questionBankId: bankId } : {}),
              ...(user.role === "ADMIN"
                ? {}
                : { questionBank: { instructorId: user.id } }),
              ...(query
                ? { text: { contains: query, mode: "insensitive" } }
                : {}),
            },
            include: { options: { orderBy: { position: "asc" } } },
            take: 100,
            orderBy: { createdAt: "desc" },
          }),
        );
      }
      if (route === "notifications")
        return Response.json(
          await db.notification.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
        );
      if (route === "audit") {
        requireRole(user.role, ["ADMIN"]);
        return Response.json(
          await db.auditLog.findMany({
            where: query
              ? { action: { contains: query, mode: "insensitive" } }
              : {},
            include: { actor: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 25,
            skip,
          }),
        );
      }
      if (route === "integrity")
        return Response.json(
          await integrity(user, url.searchParams.get("attemptId") || undefined),
        );
      if (route === "settings") {
        requireRole(user.role, ["ADMIN"]);
        return Response.json(await db.platformSetting.findMany());
      }
      if (route === "export") {
        requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
        const data = await dashboard(user);
        await createAuditLog(
          user.id,
          "REPORT_EXPORTED",
          "ExamAttempt",
          "report",
        );
        const csv = [
          ["Exam", "Student", "Status", "Percentage", "Submitted"],
          ...data.attempts.map((a) => [
            a.title,
            a.student,
            a.status,
            a.percentage,
            a.submittedAt?.toISOString(),
          ]),
        ]
          .map((row) => row.map(csvEscape).join(","))
          .join("\r\n");
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition":
              'attachment; filename="examguard-results.csv"',
          },
        });
      }
    }
    if (method === "POST") {
      if (route === "exams")
        return Response.json(await saveExam(user, body), { status: 201 });
      if (path[0] === "exams" && path.length === 3) {
        if (path[2] === "start") {
          requireRole(user.role, ["STUDENT"]);
          return Response.json(await startAttempt(user.id, path[1]), {
            status: 201,
          });
        }
        if (path[2] === "assign") {
          await ownedExam(user, path[1]);
          const { emails } = z
            .object({ emails: z.array(z.email()).min(1).max(500) })
            .strict()
            .parse(body);
          const students = await db.user.findMany({
            where: {
              email: { in: emails.map((e) => e.toLowerCase()) },
              role: "STUDENT",
              status: "ACTIVE",
            },
            select: { id: true },
          });
          invariant(
            students.length ===
              new Set(emails.map((e) => e.toLowerCase())).size,
            400,
            "Every email must belong to an active student.",
          );
          await db.$transaction(async (tx) => {
            await tx.examAssignment.createMany({
              data: students.map((s) => ({ examId: path[1], studentId: s.id })),
              skipDuplicates: true,
            });
            await createAuditLog(
              user.id,
              "EXAM_ASSIGNED",
              "Exam",
              path[1],
              { count: students.length },
              tx,
            );
          });
          return Response.json({ count: students.length });
        }
        return Response.json(await changeExamStatus(user, path[1], path[2]));
      }
      if (route === "courses")
        return Response.json(await saveCourse(user, body), { status: 201 });
      if (route === "enrollments")
        return Response.json(await enroll(user, body));
      if (route === "enrollments/import") {
        const input = z
          .object({
            courseId: z.string(),
            content: z.string().max(100000),
            confirm: z.boolean().default(false),
          })
          .strict()
          .parse(body);
        const emails = parseEnrollmentCsv(input.content);
        if (!input.confirm) {
          requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
          return Response.json({ emails });
        }
        return Response.json(
          await enroll(user, { courseId: input.courseId, emails }),
        );
      }
      if (route === "people")
        return Response.json(await manageUser(user, body), { status: 201 });
      if (route === "banks") {
        requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
        const { title } = z
          .object({ title: z.string().trim().min(3).max(150) })
          .strict()
          .parse(body);
        const bank = await db.questionBank.create({
          data: { title, instructorId: user.id },
        });
        await createAuditLog(user.id, "BANK_CREATED", "QuestionBank", bank.id);
        return Response.json(bank, { status: 201 });
      }
      if (route === "questions")
        return Response.json(await createQuestion(user, body), { status: 201 });
      if (route === "questions/import")
        return Response.json(await importQuestions(user, body));
      if (path[0] === "attempts" && path.length === 3) {
        const id = path[1];
        if (path[2] === "grade")
          return Response.json(await gradeSubmission(user, id, body));
        requireRole(user.role, ["STUDENT"]);
        if (path[2] === "answer")
          return Response.json(
            await saveAnswer(user.id, id, answerSchema.parse(body)),
          );
        if (path[2] === "submit")
          return Response.json(await submitAttempt(user.id, id));
        if (path[2] === "events") {
          const { eventType } = eventSchema.parse(body);
          await rateLimit("events:" + id + ":" + user.id, 120, 60);
          await db.$transaction(async (tx) => {
            await lockAttempt(tx, id);
            const a = await tx.examAttempt.findUnique({
              where: { id },
              include: { exam: { include: { settings: true } } },
            });
            invariant(
              a && a.studentId === user.id,
              403,
              "Attempt is unavailable.",
            );
            invariant(
              a.status === "IN_PROGRESS" && a.expiresAt > new Date(),
              409,
              "Attempt is closed.",
            );
            if (a.exam.settings?.integrityEnabled === false) return;
            const weights = a.exam.settings?.severityWeights as
              Record<string, number> | undefined;
            const severity =
              weights?.[eventType] ??
              (["TAB_HIDDEN", "FULLSCREEN_EXIT"].includes(eventType)
                ? 2
                : [
                      "PASTE",
                      "COPY",
                      "CUT",
                      "CONTEXT_MENU",
                      "RAPID_CHANGES",
                    ].includes(eventType)
                  ? 1
                  : 0);
            await tx.antiCheatEvent.create({
              data: { attemptId: id, studentId: user.id, eventType, severity },
            });
            await tx.examAttempt.update({
              where: { id },
              data: {
                ...(eventType === "TAB_HIDDEN"
                  ? { tabSwitchCount: { increment: 1 } }
                  : {}),
                ...(eventType === "FULLSCREEN_EXIT"
                  ? { fullscreenExitCount: { increment: 1 } }
                  : {}),
                suspiciousEventCount: { increment: severity > 0 ? 1 : 0 },
              },
            });
          });
          return Response.json({ recorded: true });
        }
      }
      if (route === "notifications/read") {
        await db.notification.updateMany({
          where: { userId: user.id, readAt: null },
          data: { readAt: new Date() },
        });
        return Response.json({ ok: true });
      }
      if (route === "integrity/review") {
        requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
        const { eventId } = z
          .object({ eventId: z.string() })
          .strict()
          .parse(body);
        const event = await db.antiCheatEvent.findUnique({
          where: { id: eventId },
          include: { attempt: { include: { exam: true } } },
        });
        invariant(event, 404, "Event not found.");
        requireOwnership(user, event.attempt.exam.instructorId);
        await db.$transaction(async (tx) => {
          await tx.antiCheatEvent.update({
            where: { id: eventId },
            data: { reviewedBy: user.id, reviewedAt: new Date() },
          });
          await createAuditLog(
            user.id,
            "INTEGRITY_REVIEWED",
            "AntiCheatEvent",
            eventId,
            {},
            tx,
          );
        });
        return Response.json({ ok: true });
      }
    }
    if (method === "PATCH") {
      if (path[0] === "exams" && path.length === 2)
        return Response.json(await saveExam(user, body, path[1]));
      if (path[0] === "people" && path.length === 2)
        return Response.json(await manageUser(user, body, path[1]));
      if (route === "profile")
        return Response.json(await updateProfile(user, body));
      if (route === "settings") {
        requireRole(user.role, ["ADMIN"]);
        const input = z
          .object({
            institutionName: z.string().trim().min(2).max(150),
            supportEmail: z.email(),
            integrityNotice: z.string().max(2000),
          })
          .strict()
          .parse(body);
        await db.$transaction(async (tx) => {
          for (const [key, value] of Object.entries(input))
            await tx.platformSetting.upsert({
              where: { key },
              create: { key, value },
              update: { value },
            });
          await createAuditLog(
            user.id,
            "SETTINGS_UPDATED",
            "PlatformSetting",
            "platform",
            {},
            tx,
          );
        });
        return Response.json({ saved: true });
      }
      if (path[0] === "questions" && path.length === 2) {
        requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
        const q = await db.question.findUnique({
          where: { id: path[1] },
          include: { questionBank: true },
        });
        invariant(q, 404, "Question not found.");
        requireOwnership(user, q.questionBank.instructorId);
        const input = z
          .object({ isActive: z.literal(false) })
          .strict()
          .parse(body);
        await db.question.update({ where: { id: q.id }, data: input });
        await createAuditLog(user.id, "QUESTION_RETIRED", "Question", q.id);
        return Response.json({ ok: true });
      }
    }
    invariant(false, 404, "Route not found.");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        return Response.json(
          { error: "A record with these details already exists." },
          { status: 409 },
        );
      if (error.code === "P2025")
        return Response.json({ error: "Record not found." }, { status: 404 });
    }
    return errorResponse(error);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
