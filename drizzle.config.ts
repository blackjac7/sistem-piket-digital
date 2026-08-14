import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

if (!process.env.DB_CONNECTION) {
  throw new Error("DB_CONNECTION belum diatur. Salin .env.example menjadi .env.local.");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DB_CONNECTION },
  strict: true,
  verbose: true,
});
