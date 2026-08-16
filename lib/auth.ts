import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "smp_ip_yakin_session";
const SESSION_DAYS = 7;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSessionRecord(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function createSession(userId: number) {
  const { token, expiresAt } = await createSessionRecord(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const result = await db
    .select({ id: users.id, name: users.name, username: users.username, role: users.role, teacherId: users.teacherId, mustChangePassword: users.mustChangePassword })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.isActive, true)))
    .limit(1);

  return result[0] ?? null;
}

export async function requireUser({ allowPasswordChange = false }: { allowPasswordChange?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !allowPasswordChange) redirect("/account/password");
  return user;
}

export function destinationForUser(user: { role: string; mustChangePassword?: boolean }) {
  if (user.mustChangePassword) return "/account/password";
  return user.role === "WAKASEK_KURIKULUM" ? "/monitoring" : "/dashboard";
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

type UserRole = typeof users.$inferSelect.role;

export async function requireRoles(roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(user.role === "WAKASEK_KURIKULUM" ? "/monitoring" : "/dashboard");
  return user;
}
