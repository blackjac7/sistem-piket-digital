export const rpName = process.env.WEBAUTHN_RP_NAME || "SMP IP YAKIN";
export const rpID = process.env.WEBAUTHN_RP_ID || "localhost";
export const expectedOrigin = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";
export const challengeCookieName = "smp_ip_yakin_webauthn_challenge";

export const challengeCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 300,
  priority: "high" as const,
};
