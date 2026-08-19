import { cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createWebAuthnChallenge } from "@/lib/webauthn-challenges";
import { challengeCookieName, challengeCookieOptions, rpID } from "@/lib/webauthn";
import { reportServerError } from "@/lib/server-errors";

export async function POST() {
  try {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      timeout: 60_000,
    });
    const token = await createWebAuthnChallenge({ challenge: options.challenge, flow: "login" });
    const cookieStore = await cookies();
    cookieStore.set(challengeCookieName, token, challengeCookieOptions);
    return Response.json(options);
  } catch (error) {
    const reference = reportServerError("passkey-login-options", error);
    return Response.json({ error: `Passkey belum dapat disiapkan. Coba kembali. Referensi: ${reference}.` }, { status: 503 });
  }
}
