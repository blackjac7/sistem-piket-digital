import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passkeys } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { challengeCookieName, flowCookieName, rpID, rpName } from "@/lib/webauthn";
import { reportServerError } from "@/lib/server-errors";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Sesi telah berakhir. Silakan login kembali." }, { status: 401 });
    const credentials = await db.select({ id: passkeys.credentialId, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, user.id));
    const options = await generateRegistrationOptions({
      rpName, rpID, userID: new TextEncoder().encode(String(user.id)), userName: user.username, userDisplayName: user.name,
      attestationType: "none", preferredAuthenticatorType: "localDevice",
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      excludeCredentials: credentials.map((item) => ({ id: item.id, transports: item.transports ? JSON.parse(item.transports) : undefined })),
    });
    const cookieStore = await cookies();
    const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300, priority: "high" as const };
    cookieStore.set(challengeCookieName, options.challenge, cookieOptions);
    cookieStore.set(flowCookieName, `register:${user.id}`, cookieOptions);
    return Response.json(options);
  } catch (error) {
    const reference = reportServerError("passkey-register-options", error);
    return Response.json({ error: `Pendaftaran passkey belum dapat dimulai. Coba kembali. Referensi: ${reference}.` }, { status: 503 });
  }
}
