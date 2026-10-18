import { createHmac } from "node:crypto";
import { invariant } from "./errors";
export function stableShuffle<T>(items: T[], seed: string): T[] {
  return items
    .map((item, index) => ({
      item,
      key: createHmac("sha256", seed).update(String(index)).digest("hex"),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((v) => v.item);
}
export function validateAvailability(
  exam: { status: string; startAt: Date; endAt: Date },
  now: Date,
) {
  invariant(exam.status === "PUBLISHED", 409, "This exam is not published.");
  invariant(
    now >= exam.startAt && now < exam.endAt,
    409,
    "This exam is outside its availability window.",
  );
}
export function validateDeadline(expiresAt: Date, now: Date) {
  invariant(
    now < expiresAt,
    409,
    "Time has expired. Your saved answers have been submitted.",
  );
}
export function validateAttemptLimit(count: number, max: number) {
  invariant(count < max, 409, "You have reached the attempt limit.");
}
export function normalizeAnswer(text: string) {
  return text
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}
export function gradeAnswer(
  question: {
    type: string;
    points: number;
    correctOptionIds: string[];
    correctText: string | null;
  },
  answer: { text: string; optionIds: string[] },
) {
  const maxCents = Math.round(question.points * 100);
  if (question.type === "ESSAY") return null;
  if (question.type === "SHORT_ANSWER")
    return normalizeAnswer(answer.text) ===
      normalizeAnswer(question.correctText || "")
      ? maxCents / 100
      : 0;
  const chosen = [...new Set(answer.optionIds)];
  if (question.type === "MULTIPLE_CHOICE") {
    const right = chosen.filter((id) =>
      question.correctOptionIds.includes(id),
    ).length;
    const wrong = chosen.length - right;
    return (
      Math.round(
        maxCents *
          Math.max(0, (right - wrong) / question.correctOptionIds.length),
      ) / 100
    );
  }
  return chosen.length === 1 && question.correctOptionIds.includes(chosen[0])
    ? maxCents / 100
    : 0;
}
export function totals(grades: number[], maximum: number, passing: number) {
  const score = grades.reduce((sum, g) => sum + Math.round(g * 100), 0) / 100;
  const percentage = maximum ? Math.round((score / maximum) * 10000) / 100 : 0;
  return { score, percentage, passed: percentage >= passing };
}
export function riskSummary(events: { eventType: string; severity: number }[]) {
  const score = events.reduce((s, e) => s + e.severity, 0);
  return {
    score,
    label:
      score >= 12
        ? "Review recommended"
        : score >= 4
          ? "Some activity"
          : "Low activity",
    notice:
      "Browser activity is an indicator, not proof of misconduct. It never changes the academic score.",
  };
}
export function analytics(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    count: n,
    average: n ? values.reduce((a, b) => a + b, 0) / n : 0,
    median: n
      ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.ceil((n - 1) / 2)]) / 2
      : 0,
    highest: n ? sorted[n - 1] : 0,
    lowest: n ? sorted[0] : 0,
    distribution: [0, 20, 40, 60, 80].map((min) => ({
      label: `${min}–${min + 20}`,
      count: values.filter(
        (v) => v >= min && (min === 80 ? v <= 100 : v < min + 20),
      ).length,
    })),
  };
}
