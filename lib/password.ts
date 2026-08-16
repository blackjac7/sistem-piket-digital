import { randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { compare } from "bcryptjs";

const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

const COMMON_PASSWORDS = new Set([
  "password", "password123", "123456789012", "qwerty123456", "admin123456",
  "smpyakin#2026", "smpip yakin", "smpipyakin", "indonesia123",
]);

export async function hashPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    if (passwordHash.startsWith("$argon2")) return await verify(passwordHash, password);
    if (/^\$2[aby]\$/.test(passwordHash)) return await compare(password, passwordHash);
    return false;
  } catch {
    return false;
  }
}

export function needsPasswordRehash(passwordHash: string) {
  if (!passwordHash.startsWith("$argon2id$")) return true;
  const parameters = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(passwordHash);
  if (!parameters) return true;
  return Number(parameters[1]) < ARGON2_OPTIONS.memoryCost
    || Number(parameters[2]) < ARGON2_OPTIONS.timeCost
    || Number(parameters[3]) < ARGON2_OPTIONS.parallelism;
}

export function generateTemporaryPassword(length = 20) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*-_";
  const all = letters + digits + symbols;
  const required = [letters[randomInt(letters.length)], digits[randomInt(digits.length)], symbols[randomInt(symbols.length)]];
  const characters = [...required, ...Array.from({ length: length - required.length }, () => all[randomInt(all.length)])];
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

export function validateNewPassword(password: string, user: { username: string; name: string }) {
  if (password.length < 8) return "Kata sandi baru minimal 8 karakter.";
  if (password.length > 128) return "Kata sandi baru maksimal 128 karakter.";
  const normalized = password.toLocaleLowerCase("id-ID");
  if (COMMON_PASSWORDS.has(normalized)) return "Kata sandi ini terlalu mudah ditebak. Gunakan frasa sandi yang unik.";
  if (normalized.includes(user.username.toLocaleLowerCase("id-ID"))) return "Kata sandi tidak boleh memuat username.";
  const nameParts = user.name.toLocaleLowerCase("id-ID").split(/[^a-z0-9]+/).filter((part) => part.length >= 4);
  if (nameParts.some((part) => normalized.includes(part))) return "Kata sandi tidak boleh memuat bagian nama Anda.";
  return null;
}
