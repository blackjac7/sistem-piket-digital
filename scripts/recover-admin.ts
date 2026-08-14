import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { auditLogs, sessions, users } from "../db/schema";
import { generateTemporaryPassword, hashPassword } from "../lib/password";

loadEnvConfig(process.cwd());

function printUsage() {
  console.log("Penggunaan:");
  console.log("  npm run account:recover -- <username-admin>");
  console.log("  npm run account:recover -- <username-admin> --dry-run");
  console.log("");
  console.log("Contoh:");
  console.log("  npm run account:recover -- admin");
}

function databaseLabel(connectionString: string) {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "database dari DB_CONNECTION";
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--dry-run");
  const positional = args.filter((arg) => !arg.startsWith("--"));

  if (unknownFlags.length || positional.length !== 1) {
    if (unknownFlags.length) console.error(`Opsi tidak dikenal: ${unknownFlags.join(", ")}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const username = positional[0].trim().toLocaleLowerCase("id-ID");
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) {
    throw new Error("Format username tidak valid.");
  }

  const connectionString = process.env.DB_CONNECTION;
  if (!connectionString) throw new Error("DB_CONNECTION belum diatur. Periksa environment server atau .env.local.");

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client);
  try {
    const [account] = await db.select({ id: users.id, name: users.name, username: users.username, role: users.role, isActive: users.isActive }).from(users).where(eq(users.username, username)).limit(1);
    if (!account) throw new Error(`Akun @${username} tidak ditemukan.`);
    if (account.role !== "ADMIN") throw new Error("Pemulihan darurat hanya diizinkan untuk akun dengan role Admin IT.");
    if (!account.isActive) throw new Error("Akun Admin IT sedang nonaktif. Aktifkan melalui prosedur database yang diawasi sebelum melakukan pemulihan.");

    console.log("");
    console.log("PEMULIHAN DARURAT ADMIN IT");
    console.log(`Akun    : ${account.name} (@${account.username})`);
    console.log(`Database: ${databaseLabel(connectionString)}`);
    console.log("Dampak  : password direset, semua sesi dicabut, dan pengguna wajib mengganti password saat login.");

    if (dryRun) {
      console.log("");
      console.log("DRY RUN berhasil. Tidak ada data yang diubah.");
      return;
    }

    if (!input.isTTY || !output.isTTY) {
      throw new Error("Konfirmasi harus dilakukan dari terminal interaktif. Jalankan perintah langsung di terminal server.");
    }

    const confirmationPhrase = `PULIHKAN ${account.username}`;
    const prompt = createInterface({ input, output });
    let confirmation = "";
    try {
      confirmation = await prompt.question(`\nKetik '${confirmationPhrase}' untuk melanjutkan: `);
    } finally {
      prompt.close();
    }
    if (confirmation !== confirmationPhrase) {
      console.log("Pemulihan dibatalkan. Tidak ada data yang diubah.");
      return;
    }

    const temporaryPassword = generateTemporaryPassword(24);
    const passwordHash = await hashPassword(temporaryPassword);
    await db.transaction(async (tx) => {
      await tx.update(users).set({
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      }).where(eq(users.id, account.id));
      await tx.delete(sessions).where(eq(sessions.userId, account.id));
      await tx.insert(auditLogs).values({
        userId: account.id,
        action: "EMERGENCY_RECOVERY",
        entity: "USER",
        entityId: String(account.id),
        description: `Pemulihan darurat akun Admin IT @${account.username} dijalankan melalui CLI server; seluruh sesi dicabut.`,
      });
    });

    console.log("");
    console.log("Pemulihan berhasil.");
    console.log(`Username          : ${account.username}`);
    console.log(`Password sementara: ${temporaryPassword}`);
    console.log("");
    console.log("Password hanya ditampilkan pada output ini. Salin sekarang, kirim melalui jalur pribadi, lalu bersihkan riwayat terminal bila diperlukan.");
    console.log("Admin wajib membuat password pribadi saat login berikutnya.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\nPemulihan gagal: ${error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui."}`);
  process.exitCode = 1;
});
