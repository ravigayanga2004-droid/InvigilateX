import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import {
  loginSchema,
  registrationSchema,
  passwordSchema,
} from "@/lib/validation";
import {
  digest,
  hashPassword,
  networkKey,
  rateLimit,
  token,
  verifyPassword,
} from "@/lib/security";
import { invariant } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
export async function login(request: Request, body: unknown) {
  const input = loginSchema.parse(body);
  await rateLimit("login-network:" + networkKey(request), 100, 900);
  await rateLimit("login-email:" + digest(input.email), 10, 900);
  const user = await db.user.findUnique({ where: { email: input.email } });
  // A fixed valid hash prevents a fast path that reveals unknown email addresses.
  const valid = await verifyPassword(
    input.password,
    user?.passwordHash ||
      "$2b$12$KyqAPgSbXKM6yTrSSJsv3.PjR7uIZdSmK7eD/IlBZTg8NqAEawjRu",
  );
  if (
    !user ||
    !valid ||
    user.status !== "ACTIVE" ||
    (user.lockedUntil && user.lockedUntil > new Date()) ||
    (process.env.SMTP_URL && !user.emailVerifiedAt)
  ) {
    if (user)
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLogins: { increment: 1 },
          ...(user.failedLogins >= 4
            ? { lockedUntil: new Date(Date.now() + 900000) }
            : {}),
        },
      });
    await createAuditLog(null, "LOGIN_REJECTED", "User", user?.id || "unknown");
    invariant(
      false,
      401,
      "Unable to sign in. Check your credentials, verification, or try again later.",
    );
  }
  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id);
  await createAuditLog(user.id, "LOGIN", "User", user.id);
  return { id: user.id, name: user.name, role: user.role };
}
async function deliver(email: string, raw: string, purpose: string) {
  const route = purpose === "VERIFY" ? "verify-email" : "reset-password";
  const link = `${process.env.APP_URL}/${route}?token=${raw}`;
  if (process.env.SMTP_URL) {
    await nodemailer
      .createTransport(process.env.SMTP_URL)
      .sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject:
          purpose === "VERIFY"
            ? "Verify your ExamGuard email"
            : "Reset your ExamGuard password",
        text: `Open this one-time link within 30 minutes: ${link}`,
      });
  } else {
    invariant(
      process.env.NODE_ENV !== "production",
      503,
      "Email delivery must be configured by your administrator.",
    );
    await mkdir(".local/mail", { recursive: true });
    await writeFile(
      path.join(".local/mail", `${Date.now()}-${token().slice(0, 8)}.txt`),
      `To: ${email}\n${link}`,
      { mode: 0o600 },
    );
  }
}
async function issueToken(userId: string, email: string, purpose = "RESET") {
  const raw = token();
  await db.passwordResetToken.create({
    data: {
      id: digest(raw),
      userId,
      purpose,
      expiresAt: new Date(Date.now() + 1800000),
    },
  });
  await deliver(email, raw, purpose);
}
export async function register(request: Request, body: unknown) {
  invariant(
    process.env.ALLOW_REGISTRATION === "true",
    403,
    "Self-registration is disabled. Contact your administrator.",
  );
  await rateLimit("register:" + networkKey(request), 5, 3600);
  const input = registrationSchema.parse(body);
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (!existing) {
    const user = await db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: process.env.SMTP_URL ? null : new Date(),
      },
    });
    if (process.env.SMTP_URL) await issueToken(user.id, user.email, "VERIFY");
    await createAuditLog(user.id, "REGISTER", "User", user.id);
  }
  return {
    message:
      "If registration is available for this email, your account has been created. Check your email if verification is configured.",
  };
}
export async function forgotPassword(request: Request, body: unknown) {
  const { email } = z
    .object({ email: z.email().transform((v) => v.toLowerCase()) })
    .strict()
    .parse(body);
  await rateLimit("reset:" + networkKey(request), 10, 3600);
  await rateLimit("reset-email:" + digest(email), 3, 3600);
  const user = await db.user.findUnique({ where: { email } });
  invariant(
    process.env.NODE_ENV !== "production" || process.env.SMTP_URL,
    503,
    "Email recovery is unavailable. Contact your administrator.",
  );
  if (user && user.status === "ACTIVE") await issueToken(user.id, email);
  return {
    message: "If an eligible account exists, a recovery link has been sent.",
  };
}
export async function resetPassword(body: unknown) {
  const input = z
    .object({ token: z.string().length(64), password: passwordSchema })
    .strict()
    .parse(body);
  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async (tx) => {
    const key = digest(input.token);
    const used = await tx.passwordResetToken.updateMany({
      where: {
        id: key,
        purpose: "RESET",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    invariant(
      used.count === 1,
      400,
      "This recovery link is invalid or expired.",
    );
    const reset = await tx.passwordResetToken.findUniqueOrThrow({
      where: { id: key },
    });
    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash, failedLogins: 0, lockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    await tx.passwordResetToken.updateMany({
      where: { userId: reset.userId, usedAt: null, purpose: "RESET" },
      data: { usedAt: new Date() },
    });
    await createAuditLog(
      reset.userId,
      "PASSWORD_RESET",
      "User",
      reset.userId,
      {},
      tx,
    );
  });
  await destroySession();
  return { message: "Password updated. Please sign in again." };
}
export async function verifyEmail(body: unknown) {
  const { token: raw } = z
    .object({ token: z.string().length(64) })
    .strict()
    .parse(body);
  await db.$transaction(async (tx) => {
    const key = digest(raw);
    const used = await tx.passwordResetToken.updateMany({
      where: {
        id: key,
        purpose: "VERIFY",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    invariant(
      used.count === 1,
      400,
      "This verification link is invalid or expired.",
    );
    const entry = await tx.passwordResetToken.findUniqueOrThrow({
      where: { id: key },
    });
    await tx.user.update({
      where: { id: entry.userId },
      data: { emailVerifiedAt: new Date() },
    });
  });
  return { message: "Email verified. You can now sign in." };
}
