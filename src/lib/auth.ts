import { cookies } from "next/headers";
import { db } from "./db";
import { digest, token } from "./security";
import { invariant } from "./errors";
export const SESSION_COOKIE = "examguard_session";
export async function currentUser() {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const session = await db.session.findUnique({ where: { id: digest(raw) }, include: { user: true } });
  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE" || (session.user.lockedUntil && session.user.lockedUntil > new Date())) return null;
  const { id, name, email, role, status, lastLoginAt } = session.user;
  return { id, name, email, role, status, lastLoginAt };
}
export async function requireAuth() { const user = await currentUser(); invariant(user, 401, "Please sign in to continue."); return user; }
export async function createSession(userId: string) {
  const raw = token(); const expiresAt = new Date(Date.now() + 1000*60*60*12);
  await db.session.create({ data: { id: digest(raw), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}
export async function destroySession() {
  const jar = await cookies(); const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) await db.session.deleteMany({ where: { id: digest(raw) } });
  jar.delete(SESSION_COOKIE);
}
