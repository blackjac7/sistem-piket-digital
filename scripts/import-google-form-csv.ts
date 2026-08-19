import { loadEnvConfig } from "@next/env";
import { and, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { attendanceRecords, teachers, users } from "../db/schema";
import { normalizeTeacherName } from "../lib/teacher-names";

loadEnvConfig(process.cwd());
const connectionString = process.env.DB_CONNECTION;
if (!connectionString) throw new Error("DB_CONNECTION belum diatur.");

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function dateValue(value: string) {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim());
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value.trim());
  if (!match) throw new Error(`Tanggal tidak valid: ${value}`);
  const first = Number(match[1]);
  const second = Number(match[2]);
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nameKey(value: string) {
  return normalizeTeacherName(value).split(",")[0].replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
}

function namesFromCell(value: string, teacherRows: Array<{ name: string }>) {
  const source = nameKey(value);
  return teacherRows.filter((teacher) => source.includes(nameKey(teacher.name))).map((teacher) => teacher.name);
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Gunakan: npm run import:gform -- <file.csv>");
  const rows = parseCsv(await readFile(file, "utf8"));
  const headers = rows.shift() || [];
  const dateColumn = headers.findIndex((header) => header.trim().toUpperCase() === "TANGGAL");
  const recorderColumn = headers.findIndex((header) => header.trim().toUpperCase() === "NAMA GURU");
  if (dateColumn < 0 || recorderColumn < 0) throw new Error("CSV harus memiliki kolom NAMA GURU dan TANGGAL.");
  const statusColumns = headers.map((header, index) => {
    const upper = header.toUpperCase();
    const status = upper.includes("SAKIT") ? "SAKIT" : upper.includes("IJIN") || upper.includes("IZIN") ? "IZIN" : upper.includes("ALPA") ? "ALPA" : null;
    return status ? { index, status: status as "SAKIT" | "IZIN" | "ALPA" } : null;
  }).filter((value): value is { index: number; status: "SAKIT" | "IZIN" | "ALPA" } => Boolean(value));
  const client = postgres(connectionString!, { max: 1, prepare: false });
  const db = drizzle(client);
  const teacherRows = await db.select({ id: teachers.id, name: teachers.name }).from(teachers);
  const teacherByName = new Map(teacherRows.map((teacher) => [nameKey(teacher.name), teacher]));
  const userRows = await db.select({ id: users.id, teacherId: users.teacherId }).from(users);
  const userByTeacher = new Map(userRows.filter((user) => user.teacherId).map((user) => [user.teacherId!, user]));
  let imported = 0;
  for (const [rowIndex, row] of rows.entries()) {
    const date = dateValue(row[dateColumn] || "");
    const recorderTeacher = teacherByName.get(nameKey(row[recorderColumn] || ""));
    const recorder = recorderTeacher ? userByTeacher.get(recorderTeacher.id) : undefined;
    if (!recorder) throw new Error(`Akun guru piket tidak ditemukan pada baris ${rowIndex + 2}.`);
    for (const column of statusColumns) for (const rawName of namesFromCell(row[column.index] || "", teacherRows)) {
      const absentTeacher = teacherByName.get(nameKey(rawName));
      if (!absentTeacher) throw new Error(`Guru ${rawName} tidak ditemukan pada baris ${rowIndex + 2}.`);
      const existing = await db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.type, "GURU"), eq(attendanceRecords.teacherId, absentTeacher.id), eq(attendanceRecords.status, column.status), eq(attendanceRecords.attendanceDate, date))).limit(1);
      if (existing.length) continue;
      await db.insert(attendanceRecords).values({ type: "GURU", personName: absentTeacher.name, teacherId: absentTeacher.id, status: column.status, attendanceDate: date, notes: `Migrasi Google Form CSV (baris ${rowIndex + 2}).`, isConfirmed: true, recordedBy: recorder.id });
      imported++;
    }
  }
  console.log(`Sinkronisasi selesai: ${imported} catatan baru.`);
  await client.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
