import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passkeys } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createWebAuthnChallenge } from "@/lib/webauthn-challenges";
import { challengeCookieName, challengeCookieOptions, rpID, rpName } from "@/lib/webauthn";
import { reportServerError } from "@/lib/server-errors";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Sesi telah berakhir. Silakan login kembali." }, { status: 401 });
    const credentials = await db.select({ id: passkeys.credentialId, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, user.id));
    const options = await generateRegistrationOptions({
      rpName, rpID, userID: new TextEncoder().encode(String(user.id)), userName: user.username, userDisplayName: user.name,
      attestationType: "none", preferredAuthenticatorType: "localDevice",
      timeout: 60_000,
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      excludeCredentials: credentials.map((item) => ({ id: item.id, transports: item.transports ? JSON.parse(item.transports) : undefined })),
    });
    const token = await createWebAuthnChallenge({ challenge: options.challenge, flow: "register", userId: user.id });
    const cookieStore = await cookies();
    cookieStore.set(challengeCookieName, token, challengeCookieOptions);
    return Response.json(options);
  } catch (error) {
    const reference = reportServerError("passkey-register-options", error);
    return Response.json({ error: `Pendaftaran passkey belum dapat dimulai. Coba kembali. Referensi: ${reference}.` }, { status: 503 });
  }
}
