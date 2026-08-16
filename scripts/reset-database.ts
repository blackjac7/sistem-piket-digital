import { spawnSync } from "node:child_process";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

loadEnvConfig(process.cwd());

const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
  console.log(`Penggunaan: npm run db:reset -- [opsi]

Opsi:
  --yes           Lewati konfirmasi interaktif
  --allow-remote  Izinkan reset database non-lokal
  --help          Tampilkan bantuan`);
  process.exit(0);
}

const databaseConnection = process.env.DB_CONNECTION;
if (!databaseConnection) throw new Error("DB_CONNECTION belum diatur.");
const connectionString: string = databaseConnection;

const databaseUrl = new URL(connectionString);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
const databaseLabel = `${databaseUrl.hostname}:${databaseUrl.port || "5432"}/${databaseName}`;
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres", "host.docker.internal"]);

if (!localHosts.has(databaseUrl.hostname) && !args.has("--allow-remote")) {
  throw new Error(
    `Reset database remote ${databaseLabel} ditolak. Tambahkan --allow-remote jika target ini memang benar.`,
  );
}

async function confirmReset() {
  if (args.has("--yes")) return;
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Konfirmasi interaktif tidak tersedia. Tambahkan --yes untuk melanjutkan.");
  }

  const confirmationText = `RESET ${databaseName}`;
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`Database yang akan direset: ${databaseLabel}`);
    console.log("Seluruh data aplikasi akan dihapus, lalu migrasi dan seed dijalankan ulang.");
    const answer = await prompt.question(`Ketik \"${confirmationText}\" untuk melanjutkan: `);
    if (answer !== confirmationText) throw new Error("Reset database dibatalkan.");
  } finally {
    prompt.close();
  }
}

function runNpmScript(script: string) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", script], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm run ${script} gagal dengan kode ${result.status}.`);
}

async function resetDatabase() {
  await confirmReset();

  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    await client.begin(async (transaction) => {
      await transaction.unsafe('DROP SCHEMA IF EXISTS "public" CASCADE');
      await transaction.unsafe('DROP SCHEMA IF EXISTS "drizzle" CASCADE');
      await transaction.unsafe('CREATE SCHEMA "public"');
    });
  } finally {
    await client.end();
  }

  runNpmScript("db:migrate");
  runNpmScript("db:seed");
  console.log(`Database ${databaseLabel} berhasil direset.`);
}

resetDatabase().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
