import { cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passkeys, users } from "@/db/schema";
import { challengeCookieName, flowCookieName, rpID } from "@/lib/webauthn";

export async function POST(request: Request) {
  const parsed = z.object({ username: z.string().trim().min(3) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Masukkan username terlebih dahulu." }, { status: 400 });
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, parsed.data.username.toLowerCase())).limit(1);
  if (!user) return Response.json({ error: "Akun tidak ditemukan." }, { status: 404 });
  const credentials = await db.select({ id: passkeys.credentialId, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, user.id));
  if (!credentials.length) return Response.json({ error: "Akun ini belum memiliki passkey. Masuk dengan password lalu daftarkan perangkat." }, { status: 400 });
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: credentials.map((item) => ({ id: item.id, transports: item.transports ? JSON.parse(item.transports) : undefined })) });
  const cookieStore = await cookies();
  cookieStore.set(challengeCookieName, options.challenge, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
  cookieStore.set(flowCookieName, `login:${user.id}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
  return Response.json(options);
}
