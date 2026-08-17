import { cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passkeys, users } from "@/db/schema";
import { challengeCookieName, flowCookieName, rpID } from "@/lib/webauthn";
import { reportServerError } from "@/lib/server-errors";

export async function POST(request: Request) {
  try {
    const parsed = z.object({ username: z.string().trim().min(3) }).safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Masukkan username terlebih dahulu." }, { status: 400 });
    const [user] = await db.select({ id: users.id, isActive: users.isActive, lockedUntil: users.lockedUntil }).from(users).where(eq(users.username, parsed.data.username.toLowerCase())).limit(1);
    if (!user?.isActive || (user.lockedUntil && user.lockedUntil > new Date())) return Response.json({ error: "Passkey belum tersedia untuk akun ini. Gunakan login password." }, { status: 400 });
    const credentials = await db.select({ id: passkeys.credentialId, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, user.id));
    if (!credentials.length) return Response.json({ error: "Passkey belum tersedia untuk akun ini. Gunakan login password." }, { status: 400 });
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: credentials.map((item) => ({ id: item.id, transports: item.transports ? JSON.parse(item.transports) : undefined })) });
    const cookieStore = await cookies();
    const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300, priority: "high" as const };
    cookieStore.set(challengeCookieName, options.challenge, cookieOptions);
    cookieStore.set(flowCookieName, `login:${user.id}`, cookieOptions);
    return Response.json(options);
  } catch (error) {
    const reference = reportServerError("passkey-login-options", error);
    return Response.json({ error: `Passkey belum dapat disiapkan. Coba kembali. Referensi: ${reference}.` }, { status: 503 });
  }
}
