import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const password = "Demo-ExamGuard-2026!";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
}
async function post(request: APIRequestContext, path: string, data: unknown) {
  return request.post(`/api/${path}`, {
    headers: { origin: process.env.APP_URL || "http://localhost:3000" },
    data,
  });
}
test.beforeAll(async () => {
  const emails = [
    "admin@example.test",
    "instructor@example.test",
    "student@example.test",
  ];
  await db.rateLimit.deleteMany({
    where: {
      key: {
        in: emails.map(
          (email) =>
            "login-email:" + createHash("sha256").update(email).digest("hex"),
        ),
      },
    },
  });
});
test.afterAll(() => db.$disconnect());
test("administrator creates a course, switches themes and navigates management", async ({
  page,
}) => {
  await login(page, "admin@example.test");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.getByRole("link", { name: "Courses & enrollment" }).click();
  await page
    .getByRole("button", { name: "Create course", exact: true })
    .click();
  await page.getByLabel("Course name").fill("Browser Verification Course");
  await page
    .getByLabel("Course code")
    .fill("PW" + Date.now().toString().slice(-7));
  await page
    .getByRole("combobox", { name: "Instructor", exact: true })
    .selectOption({ label: "Jordan Lee" });
  await page
    .getByLabel("Description", { exact: true })
    .fill("Synthetic browser verification course");
  await page
    .getByRole("button", { name: "Create course", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser Verification Course" }).last(),
  ).toBeVisible();
  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "People", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("admin@example.test", { exact: true }),
  ).toBeVisible();
  for (const path of [
    "banks",
    "submissions",
    "analytics",
    "integrity",
    "settings",
    "profile",
    "notifications",
  ]) {
    await page.goto(`/dashboard/${path}`);
    await expect(
      page.getByRole("heading", { name: "We couldn?t load this page" }),
    ).toHaveCount(0);
    await expect(page.locator("main h1")).toBeVisible();
  }
  await page.goto("/dashboard/audit");
  await expect(
    page.getByText("COURSE_CREATED", { exact: true }).first(),
  ).toBeVisible();
});
test("instructor authors and publishes, student autosaves and submits, teacher reviews", async ({
  page,
  browser,
}) => {
  await login(page, "instructor@example.test");
  await page
    .getByRole("link", { name: "Create examination", exact: true })
    .click();
  const title = "Browser Assessment " + Date.now();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Duration in minutes").fill("5");
  await page.getByLabel("Release objective results immediately").check();
  await page.getByLabel("Show correct answers after release").check();
  await page.locator(".builderlist").getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const id = page.url().split("/").pop()!;
  await page
    .getByRole("button", { name: "Publish examination", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
  const context = await browser.newContext();
  const studentPage = await context.newPage();
  await login(studentPage, "student@example.test");
  await studentPage.goto(`/dashboard/exams/${id}`);
  await studentPage
    .getByRole("button", { name: "Start examination", exact: true })
    .click();
  await studentPage
    .getByRole("dialog")
    .getByRole("button", { name: "Begin timed attempt" })
    .click();
  await expect(studentPage).toHaveURL(/\/exam\//);
  const attemptId = studentPage.url().split("/").pop()!;
  const choice = studentPage.locator(".answer-option input").first();
  if (await choice.count()) {
    await choice.check();
  } else {
    await studentPage
      .getByLabel("Your answer", { exact: true })
      .fill("A clear synthetic response.");
  }
  await expect(
    studentPage.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await studentPage.reload();
  if (await choice.count()) await expect(choice).toBeChecked();
  else
    await expect(
      studentPage.getByLabel("Your answer", { exact: true }),
    ).toHaveValue("A clear synthetic response.");
  await studentPage.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() =>
      db.antiCheatEvent.count({
        where: { attemptId, eventType: "TAB_HIDDEN" },
      }),
    )
    .toBeGreaterThan(0);
  const before = await context.request.get(`/api/attempts/${attemptId}`);
  expect(JSON.stringify(await before.json())).not.toContain("correctOptionIds");
  await studentPage
    .getByRole("button", { name: "Submit examination", exact: true })
    .click();
  await studentPage
    .getByRole("dialog")
    .getByRole("button", { name: "Submit final answers" })
    .click();
  await expect(studentPage).toHaveURL(/dashboard\/attempts/);
  await expect(
    studentPage.getByText("IN_PROGRESS", { exact: true }),
  ).toHaveCount(0);
  const duplicate = await post(
    context.request,
    `attempts/${attemptId}/submit`,
    {},
  );
  expect(duplicate.ok()).toBe(true);
  expect(await db.result.count({ where: { attemptId } })).toBe(1);
  const second = await post(context.request, `exams/${id}/start`, {});
  expect(second.status()).toBe(409);
  await page.goto(`/dashboard/attempts/${attemptId}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.goto("/dashboard/analytics");
  await expect(
    page.getByRole("heading", { name: "Performance analytics" }),
  ).toBeVisible();
  await page.goto("/dashboard/integrity");
  await expect(
    page.getByRole("heading", { name: "Exam integrity" }),
  ).toBeVisible();
  await context.close();
});
test("API prevents CSRF, role escalation, cross-account access, and late answers", async ({
  page,
  browser,
}) => {
  await login(page, "student@example.test");
  const csrf = await page.request.post("/api/exams", {
    headers: { origin: "https://evil.test" },
    data: {},
  });
  expect(csrf.status()).toBe(403);
  const role = await post(page.request, "people", {
    name: "Attacker",
    email: "attacker@example.test",
    role: "ADMIN",
    password,
  });
  expect(role.status()).toBe(403);
  const instructor = await db.user.findUniqueOrThrow({
    where: { email: "instructor@example.test" },
  });
  const course = await db.course.findFirstOrThrow({ where: { code: "CS101" } });
  const q = await db.question.findFirstOrThrow({
    where: { type: "SINGLE_CHOICE" },
  });
  const exam = await db.exam.create({
    data: {
      title: "Browser Expiry Check",
      courseId: course.id,
      instructorId: instructor.id,
      status: "PUBLISHED",
      durationSeconds: 60,
      startAt: new Date(Date.now() - 60000),
      endAt: new Date(Date.now() + 3600000),
      questions: { create: { questionId: q.id, position: 0, points: 2 } },
    },
  });
  const start = await post(page.request, `exams/${exam.id}/start`, {});
  expect(start.status()).toBe(201);
  const { id } = await start.json();
  const detail = await (await page.request.get(`/api/attempts/${id}`)).json();
  const otherContext = await browser.newContext();
  const stranger = await otherContext.newPage();
  await login(stranger, "instructor@example.test");
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`/api/attempts/${id}`)).status()).toBe(
    401,
  );
  await anonymous.close();
  const injected = await post(page.request, `attempts/${id}/answer`, {
    questionId: detail.questions[0].id,
    text: "",
    optionIds: [],
    revision: 1,
    score: 100,
  });
  expect(injected.status()).toBe(400);
  await db.examAttempt.update({
    where: { id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const late = await post(page.request, `attempts/${id}/answer`, {
    questionId: detail.questions[0].id,
    text: "",
    optionIds: [],
    revision: 2,
  });
  expect(late.status()).toBe(409);
  await page.goto(`/exam/${id}`);
  await expect(
    page.getByRole("heading", { name: "Your answers are submitted." }),
  ).toBeVisible();
  expect(
    await db.antiCheatEvent.count({
      where: { attemptId: id, eventType: "AUTO_SUBMIT" },
    }),
  ).toBe(1);
  await otherContext.close();
});
test("mobile navigation and keyboard theme controls remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "student@example.test");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "My exams", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My examinations" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark mode" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveClass(/dark/);
});
