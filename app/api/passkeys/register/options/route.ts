import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passkeys } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { challengeCookieName, flowCookieName, rpID, rpName } from "@/lib/webauthn";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const credentials = await db.select({ id: passkeys.credentialId, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, user.id));
  const options = await generateRegistrationOptions({
    rpName, rpID, userID: new TextEncoder().encode(String(user.id)), userName: user.username, userDisplayName: user.name,
    attestationType: "none", preferredAuthenticatorType: "localDevice",
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    excludeCredentials: credentials.map((item) => ({ id: item.id, transports: item.transports ? JSON.parse(item.transports) : undefined })),
  });
  const cookieStore = await cookies();
  cookieStore.set(challengeCookieName, options.challenge, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
  cookieStore.set(flowCookieName, `register:${user.id}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
  return Response.json(options);
}
