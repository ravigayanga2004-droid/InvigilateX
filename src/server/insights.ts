import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/security";
export async function assessmentInsights(user: { id: string; role: Role }) {
  requireRole(user.role, ["ADMIN", "INSTRUCTOR"]);
  const where =
    user.role === "ADMIN" ? {} : { exam: { instructorId: user.id } };
  const [attempts, courses] = await Promise.all([
    db.examAttempt.findMany({
      where: { ...where, status: "GRADED" },
      orderBy: { submittedAt: "desc" },
      take: 500,
      select: {
        examId: true,
        percentage: true,
        exam: { select: { title: true } },
        questions: {
          select: {
            originalQuestionId: true,
            text: true,
            points: true,
            answer: { select: { grade: { select: { points: true } } } },
          },
        },
      },
    }),
    db.course.findMany({
      where: user.role === "ADMIN" ? {} : { instructorId: user.id },
      select: {
        name: true,
        code: true,
        _count: { select: { enrollments: true, exams: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const groups = new Map<
    string,
    {
      text: string;
      exam: string;
      values: { overall: number; fraction: number }[];
    }
  >();
  for (const a of attempts)
    for (const q of a.questions) {
      if (!q.answer?.grade) continue;
      const key = a.examId + ":" + q.originalQuestionId;
      const group = groups.get(key) || {
        text: q.text,
        exam: a.exam.title,
        values: [],
      };
      group.values.push({
        overall: Number(a.percentage),
        fraction: Number(q.points)
          ? Number(q.answer.grade.points) / Number(q.points)
          : 0,
      });
      groups.set(key, group);
    }
  const questions = [...groups]
    .map(([id, g]) => {
      const values = [...g.values].sort((a, b) => a.overall - b.overall);
      const n = values.length;
      const cohort = Math.max(1, Math.floor(n * 0.27));
      const mean = (xs: typeof values) =>
        xs.reduce((s, v) => s + v.fraction, 0) / xs.length;
      return {
        id,
        text: g.text,
        exam: g.exam,
        responses: n,
        facility: Math.round(mean(values) * 1000) / 10,
        missed: n - values.filter((v) => v.fraction === 1).length,
        discrimination:
          n >= 10
            ? Math.round(
                (mean(values.slice(-cohort)) - mean(values.slice(0, cohort))) *
                  100,
              ) / 100
            : null,
      };
    })
    .sort((a, b) => a.facility - b.facility);
  return {
    questions,
    courses: courses.map((c) => ({
      name: c.name,
      code: c.code,
      students: c._count.enrollments,
      exams: c._count.exams,
    })),
    sampleSize: attempts.length,
  };
}
