import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { webauthnChallenges } from "@/db/schema";

export type WebAuthnFlow = "login" | "register";

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createWebAuthnChallenge({
  challenge,
  flow,
  userId,
}: {
  challenge: string;
  flow: WebAuthnFlow;
  userId?: number;
}) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();

  await db.delete(webauthnChallenges).where(lte(webauthnChallenges.expiresAt, now));
  await db.insert(webauthnChallenges).values({
    tokenHash: hashToken(token),
    challenge,
    flow,
    userId,
    expiresAt: new Date(now.getTime() + CHALLENGE_LIFETIME_MS),
  });

  return token;
}

export async function consumeWebAuthnChallenge(token: string, flow: WebAuthnFlow) {
  const [record] = await db
    .update(webauthnChallenges)
    .set({ usedAt: new Date() })
    .where(and(
      eq(webauthnChallenges.tokenHash, hashToken(token)),
      eq(webauthnChallenges.flow, flow),
      isNull(webauthnChallenges.usedAt),
      gt(webauthnChallenges.expiresAt, new Date()),
    ))
    .returning({
      challenge: webauthnChallenges.challenge,
      userId: webauthnChallenges.userId,
    });

  return record ?? null;
}
