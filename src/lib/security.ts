import { createHash, createHmac, randomBytes } from "node:crypto";
import { hash, compare } from "bcryptjs";
import { Role, Prisma } from "@prisma/client";
import { db } from "./db";
import { invariant } from "./errors";
export const hashPassword = (password: string) => hash(password, 12);
export const verifyPassword = (password: string, passwordHash: string) => compare(password, passwordHash);
export const token = () => randomBytes(32).toString("hex");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function requireRole(role: Role, allowed: Role[]) { invariant(allowed.includes(role), 403, "You do not have permission to perform this action."); }
export function requireOwnership(user: { id: string; role: Role }, ownerId: string) { invariant(user.role === "ADMIN" || user.id === ownerId, 403, "This resource belongs to another account."); }
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  invariant(origin === new URL(process.env.APP_URL || "http://localhost:3000").origin, 403, "Request origin is not permitted.");
  invariant(!request.headers.get("sec-fetch-site") || request.headers.get("sec-fetch-site") !== "cross-site", 403, "Cross-site request blocked.");
}
export async function rateLimit(key: string, max = 10, seconds = 900) {
  const now = new Date();
  const rows = await db.$queryRaw<Array<{count:number}>>(Prisma.sql`INSERT INTO "RateLimit" (key,count,"expiresAt") VALUES (${key},1,${new Date(now.getTime()+seconds*1000)}) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN "RateLimit"."expiresAt" < ${now} THEN 1 ELSE "RateLimit".count + 1 END, "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < ${now} THEN ${new Date(now.getTime()+seconds*1000)} ELSE "RateLimit"."expiresAt" END RETURNING count`);
  invariant(rows[0].count <= max, 429, "Too many requests. Please try again later.");
}
export function networkKey(request: Request) {
  // Ignore spoofable forwarded headers unless a trusted reverse proxy is explicitly configured.
  const address = process.env.TRUST_PROXY === "true" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local";
  return createHmac("sha256", process.env.SESSION_SECRET || "development-network-key").update(address).digest("hex");
}
