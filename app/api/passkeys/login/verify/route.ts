import { cookies } from "next/headers";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, passkeys, users } from "@/db/schema";
import { createSession, destinationForUser } from "@/lib/auth";
import { consumeWebAuthnChallenge } from "@/lib/webauthn-challenges";
import { challengeCookieName, expectedOrigin, rpID } from "@/lib/webauthn";
import { reportServerError } from "@/lib/server-errors";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(challengeCookieName)?.value;
    cookieStore.delete(challengeCookieName);
    if (!token) return Response.json({ error: "Permintaan login telah kedaluwarsa." }, { status: 400 });
    const challenge = await consumeWebAuthnChallenge(token, "login");
    if (!challenge) return Response.json({ error: "Permintaan login telah kedaluwarsa atau sudah digunakan." }, { status: 400 });

    const response = await request.json() as AuthenticationResponseJSON;
    const [credential] = await db.select().from(passkeys).where(eq(passkeys.credentialId, response.id)).limit(1);
    if (!credential) return Response.json({ error: "Passkey tidak dikenali. Gunakan login password untuk memulihkan akses." }, { status: 401 });
    if (response.response.userHandle) {
      const userHandle = Buffer.from(response.response.userHandle, "base64url").toString("utf8");
      if (userHandle !== String(credential.userId)) return Response.json({ error: "Identitas passkey tidak cocok." }, { status: 401 });
    }
    const result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin, expectedRPID: rpID, requireUserVerification: true, credential: { id: credential.credentialId, publicKey: Buffer.from(credential.publicKey, "base64url"), counter: credential.counter, transports: credential.transports ? JSON.parse(credential.transports) : undefined } });
    if (!result.verified) return Response.json({ error: "Verifikasi perangkat gagal." }, { status: 400 });
    const [user] = await db.select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive, mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, credential.userId)).limit(1);
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
