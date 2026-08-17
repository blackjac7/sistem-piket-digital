import "server-only";

import { randomUUID } from "node:crypto";

type DatabaseError = Error & {
  code?: string;
  constraint_name?: string;
  constraint?: string;
};

export function isUniqueViolation(error: unknown, constraint?: string) {
  if (!(error instanceof Error)) return false;
  const databaseError = error as DatabaseError;
  if (databaseError.code !== "23505") return false;
  if (!constraint) return true;
  return databaseError.constraint_name === constraint || databaseError.constraint === constraint;
}

export function reportServerError(context: string, error: unknown) {
  const reference = randomUUID().slice(0, 8).toUpperCase();
  const databaseError = error instanceof Error ? error as DatabaseError : undefined;
  console.error(JSON.stringify({
    level: "error",
    reference,
    context,
    errorName: databaseError?.name || "UnknownError",
    errorCode: databaseError?.code || null,
  }));
  return reference;
}

export function internalErrorMessage(reference: string) {
  return `Proses belum berhasil. Coba kembali. Referensi: ${reference}.`;
}
