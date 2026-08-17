import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, passkeys, users } from "@/db/schema";
import { createSessionRecord, destinationForUser, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth";
import { hashPassword, needsPasswordRehash, verifyPassword } from "@/lib/password";
import { reportServerError } from "@/lib/server-errors";

const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$lKgye5eVW7udIg3/0ryKVA$dLHO8+hRzTnP9HunQJNYYfC475qWyoZyK4m2icugSbw";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const loginSchema = z.object({
  username: z.string().trim().min(3, "Username minimal 3 karakter."),
  password: z.string().min(1, "Kata sandi wajib diisi."),
});

export async function POST(request: Request) {
  try {
    const parsed = loginSchema.safeParse(Object.fromEntries(await request.formData()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.username, parsed.data.username.toLowerCase())).limit(1);
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json({ error: "Terlalu banyak percobaan login. Coba kembali dalam beberapa menit." }, { status: 429 });
    }

    const passwordValid = await verifyPassword(user?.passwordHash || DUMMY_PASSWORD_HASH, parsed.data.password);
    if (!user || !user.isActive || !passwordValid) {
      if (user?.isActive) {
        const failedLoginAttempts = user.failedLoginAttempts + 1;
        await db.update(users).set({
          failedLoginAttempts: failedLoginAttempts >= MAX_LOGIN_ATTEMPTS ? 0 : failedLoginAttempts,
          lockedUntil: failedLoginAttempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null,
          updatedAt: new Date(),
        }).where(eq(users.id, user.id));
      }
      return NextResponse.json({ error: "Username atau kata sandi tidak benar." }, { status: 401 });
    }

    const upgradedHash = needsPasswordRehash(user.passwordHash) ? await hashPassword(parsed.data.password) : undefined;
    const { token, expiresAt } = await createSessionRecord(user.id);
    const [passkeyCount] = await db.select({ value: count() }).from(passkeys).where(eq(passkeys.userId, user.id));
    const shouldOfferPasskey = !user.mustChangePassword && user.role === "GURU_PIKET" && !user.passkeyPromptedAt && passkeyCount.value === 0;

    await db.update(users).set({
      ...(upgradedHash ? { passwordHash: upgradedHash } : {}),
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));
    await db.insert(auditLogs).values({ userId: user.id, action: "LOGIN", entity: "SESSION", description: `${user.name} masuk ke sistem.` });

    const redirectTo = shouldOfferPasskey ? "/onboarding/passkey" : destinationForUser(user);
    const response = NextResponse.json({ redirectTo });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
    return response;
  } catch (error) {
    const reference = reportServerError("password-login", error);
    return NextResponse.json({ error: `Login belum dapat diproses. Coba kembali. Referensi: ${reference}.` }, { status: 503 });
  }
}
