import { cookies } from "next/headers";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, passkeys, users } from "@/db/schema";
import { createSession, destinationForUser } from "@/lib/auth";
import { challengeCookieName, expectedOrigin, flowCookieName, rpID } from "@/lib/webauthn";
import { reportServerError } from "@/lib/server-errors";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const challenge = cookieStore.get(challengeCookieName)?.value;
    const flow = cookieStore.get(flowCookieName)?.value;
    const userId = Number(flow?.split(":")[1]);
    if (!challenge || !flow?.startsWith("login:") || !userId) return Response.json({ error: "Permintaan login telah kedaluwarsa." }, { status: 400 });

    cookieStore.delete(challengeCookieName);
    cookieStore.delete(flowCookieName);
    const response = await request.json() as AuthenticationResponseJSON;
    const [credential] = await db.select().from(passkeys).where(eq(passkeys.credentialId, response.id)).limit(1);
    if (!credential || credential.userId !== userId) return Response.json({ error: "Passkey tidak dikenali." }, { status: 404 });
    const result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin, expectedRPID: rpID, requireUserVerification: true, credential: { id: credential.credentialId, publicKey: Buffer.from(credential.publicKey, "base64url"), counter: credential.counter, transports: credential.transports ? JSON.parse(credential.transports) : undefined } });
    if (!result.verified) return Response.json({ error: "Verifikasi perangkat gagal." }, { status: 400 });
    const [user] = await db.select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive, mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.isActive) return Response.json({ error: "Akun tidak aktif." }, { status: 403 });
    await db.update(passkeys).set({ counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(passkeys.id, credential.id));
    await db.update(users).set({ lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    await db.insert(auditLogs).values({ userId: user.id, action: "LOGIN_PASSKEY", entity: "SESSION", description: `${user.name} masuk menggunakan passkey.` });
    await createSession(user.id);
    return Response.json({ verified: true, redirectTo: destinationForUser(user) });
  } catch (error) {
    const reference = reportServerError("passkey-login-verify", error);
    return Response.json({ error: `Passkey tidak dapat diverifikasi. Coba mulai ulang login. Referensi: ${reference}.` }, { status: 400 });
  }
}
