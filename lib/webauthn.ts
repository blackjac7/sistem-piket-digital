export const rpName = process.env.WEBAUTHN_RP_NAME || "SMP IP YAKIN";
export const rpID = process.env.WEBAUTHN_RP_ID || "localhost";
export const expectedOrigin = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";
export const challengeCookieName = "smp_ip_yakin_webauthn_challenge";
export const flowCookieName = "smp_ip_yakin_webauthn_flow";
