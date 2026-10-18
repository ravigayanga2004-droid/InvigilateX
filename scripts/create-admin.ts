import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { passwordSchema } from "../src/lib/validation";
import { hashPassword } from "../src/lib/security";
const db = new PrismaClient();
async function main() {
  if (process.stdin.isTTY)
    throw new Error(
      "Pass the initial password through stdin from your secret manager, not a command-line argument.",
    );
  const identity = z
    .object({
      ADMIN_EMAIL: z.email().transform((v) => v.toLowerCase()),
      ADMIN_NAME: z.string().trim().min(2).max(100),
    })
    .parse(process.env);
  const password = passwordSchema.parse(readFileSync(0, "utf8").trimEnd());
  if (await db.user.findUnique({ where: { email: identity.ADMIN_EMAIL } }))
    throw new Error(
      "Account already exists. Use the audited administration interface to change access.",
    );
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: identity.ADMIN_NAME,
        email: identity.ADMIN_EMAIL,
        passwordHash: await hashPassword(password),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ADMIN_PROVISIONED",
        entityType: "User",
        entityId: user.id,
      },
    });
  });
  console.info(
    "Administrator provisioned. Sign in and manage institutional accounts through People.",
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof z.ZodError
        ? "Invalid administrator identity or password."
        : error instanceof Error
          ? error.message
          : "Provisioning failed.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
