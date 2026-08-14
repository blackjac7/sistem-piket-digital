import { cookies } from "next/headers";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/db";
import { auditLogs, passkeys, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { challengeCookieName, expectedOrigin, flowCookieName, rpID } from "@/lib/webauthn";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const cookieStore = await cookies();
  const challenge = cookieStore.get(challengeCookieName)?.value;
  const flow = cookieStore.get(flowCookieName)?.value;
  if (!challenge || flow !== `register:${user.id}`) return Response.json({ error: "Permintaan passkey telah kedaluwarsa." }, { status: 400 });
  try {
    const response = await request.json() as RegistrationResponseJSON;
    const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin, expectedRPID: rpID, requireUserVerification: true });
    if (!result.verified) return Response.json({ error: "Passkey gagal diverifikasi." }, { status: 400 });
    const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
    await db.insert(passkeys).values({ userId: user.id, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey).toString("base64url"), counter: credential.counter, deviceType: credentialDeviceType, backedUp: credentialBackedUp, transports: response.response.transports ? JSON.stringify(response.response.transports) : null, name: "Sidik jari / wajah perangkat" });
    await db.update(users).set({ passkeyPromptedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await db.insert(auditLogs).values({ userId: user.id, action: "CREATE", entity: "PASSKEY", description: `${user.name} mendaftarkan passkey baru.` });
    cookieStore.delete(challengeCookieName); cookieStore.delete(flowCookieName);
    return Response.json({ verified: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Passkey gagal didaftarkan." }, { status: 400 }); }
}
