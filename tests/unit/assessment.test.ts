import { describe, it, expect } from "vitest";
import {
  stableShuffle,
  gradeAnswer,
  totals,
  validateAvailability,
  validateDeadline,
  validateAttemptLimit,
  riskSummary,
  analytics,
} from "@/lib/assessment";
import {
  requireRole,
  requireOwnership,
  hashPassword,
  verifyPassword,
  checkOrigin,
} from "@/lib/security";
import { questionSchema, answerSchema, passwordSchema } from "@/lib/validation";
import { csvEscape } from "@/server/reporting";
describe("assessment rules", () => {
  it("uses stable randomized permutations without losing questions or options", () => {
    const xs = Array.from({ length: 30 }, (_, i) => i);
    expect(stableShuffle(xs, "a")).toEqual(stableShuffle(xs, "a"));
    expect(stableShuffle(xs, "a")).not.toEqual(stableShuffle(xs, "b"));
    expect([...stableShuffle(xs, "a")].sort((a, b) => a - b)).toEqual(xs);
  });
  it("enforces publication and both availability boundaries", () => {
    const now = new Date();
    const e = {
      status: "PUBLISHED",
      startAt: new Date(+now - 1000),
      endAt: new Date(+now + 1000),
    };
    expect(() => validateAvailability(e, now)).not.toThrow();
    expect(() =>
      validateAvailability({ ...e, status: "DRAFT" }, now),
    ).toThrow();
    expect(() => validateAvailability(e, e.endAt)).toThrow();
    expect(() => validateAvailability(e, new Date(+now - 2000))).toThrow();
  });
  it("enforces deadlines and attempt limits at the boundary", () => {
    const date = new Date();
    expect(() => validateDeadline(date, date)).toThrow();
    expect(() => validateAttemptLimit(1, 1)).toThrow();
    expect(() => validateAttemptLimit(0, 1)).not.toThrow();
  });
  it("grades choice answers and penalizes over-selection", () => {
    const q = {
      type: "MULTIPLE_CHOICE",
      points: 3,
      correctOptionIds: ["a", "b"],
      correctText: null,
    };
    expect(gradeAnswer(q, { text: "", optionIds: ["a"] })).toBe(1.5);
    expect(gradeAnswer(q, { text: "", optionIds: ["a", "c"] })).toBe(0);
    expect(gradeAnswer(q, { text: "", optionIds: ["a", "b"] })).toBe(3);
    expect(
      gradeAnswer(
        { ...q, type: "SINGLE_CHOICE" },
        { text: "", optionIds: ["a", "b"] },
      ),
    ).toBe(0);
  });
  it("normalizes exact text and leaves essays for humans", () => {
    const q = {
      type: "SHORT_ANSWER",
      points: 2,
      correctOptionIds: [],
      correctText: "Hello world",
    };
    expect(gradeAnswer(q, { text: " HELLO   world ", optionIds: [] })).toBe(2);
    expect(
      gradeAnswer(
        { ...q, type: "ESSAY" },
        { text: "Hello world", optionIds: [] },
      ),
    ).toBeNull();
  });
  it("adds fractional points without floating point drift", () => {
    expect(totals([0.1, 0.2], 0.3, 100)).toEqual({
      score: 0.3,
      percentage: 100,
      passed: true,
    });
  });
  it("keeps activity scoring explainable and separate", () => {
    expect(riskSummary([{ eventType: "PASTE", severity: 1 }])).toMatchObject({
      score: 1,
      label: "Low activity",
    });
    expect(riskSummary([]).notice).toContain("never changes");
  });
  it("handles empty and even-sized analytics", () => {
    expect(analytics([]).average).toBe(0);
    expect(analytics([10, 30, 50, 90]).median).toBe(40);
    expect(analytics([100]).distribution[4].count).toBe(1);
  });
});
describe("security contracts", () => {
  it("neutralizes formula prefixes in exported spreadsheet cells", () => {
    expect(csvEscape("  =HYPERLINK(\"https://example.test\")")).toMatch(/^"'/);
    expect(csvEscape("\n+1")).toMatch(/^"'/);
    expect(csvEscape("Safe, ordinary text")).toBe('"Safe, ordinary text"');
  });
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("A-secure-password-123");
    expect(hash).not.toContain("A-secure");
    expect(await verifyPassword("A-secure-password-123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
  it("checks both role and ownership", () => {
    expect(() => requireRole("STUDENT", ["ADMIN"])).toThrow();
    expect(() =>
      requireOwnership({ id: "a", role: "INSTRUCTOR" }, "b"),
    ).toThrow();
    expect(() =>
      requireOwnership({ id: "a", role: "ADMIN" }, "b"),
    ).not.toThrow();
  });
  it("rejects foreign and missing origins", () => {
    process.env.APP_URL = "http://localhost:3000";
    expect(() => checkOrigin(new Request("http://localhost:3000"))).toThrow();
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).toThrow();
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
  it("rejects score injection and invalid correct-answer setup", () => {
    expect(
      answerSchema.safeParse({ questionId: "q", revision: 1, score: 100 })
        .success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        questionBankId: "b",
        text: "Valid question?",
        type: "SINGLE_CHOICE",
        points: 1,
        options: [
          { text: "a", isCorrect: false },
          { text: "b", isCorrect: false },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects passwords exceeding bcrypt byte limit", () => {
    expect(passwordSchema.safeParse("😀".repeat(20)).success).toBe(false);
  });
});
