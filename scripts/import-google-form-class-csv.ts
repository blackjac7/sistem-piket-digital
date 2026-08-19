import { loadEnvConfig } from "@next/env";
import { and, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { academicYears, attendanceRecords, schoolClasses, studentEnrollments, students, teachers, users } from "../db/schema";

loadEnvConfig(process.cwd());
const connectionString = process.env.DB_CONNECTION;
if (!connectionString) throw new Error("DB_CONNECTION belum diatur.");

type Status = "SAKIT" | "IZIN" | "ALPA";

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

function personKey(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function splitNames(value: string) {
  return value.split(/[\n;]|,\s*(?=[A-Z])/).map((item) => item.trim()).filter(Boolean);
}

function statusFromHeader(header: string): Status | null {
  const upper = header.toUpperCase();
  if (upper.includes("SAKIT")) return "SAKIT";
  if (upper.includes("IJIN") || upper.includes("IZIN")) return "IZIN";
  if (upper.includes("ALPA")) return "ALPA";
  return null;
}

function gridStudentName(header: string, status: Status) {
  const label = status === "IZIN" ? "(?:IJIN|IZIN)" : status;
  const match = new RegExp(`${label}\\s*\\[([^\\]]+)\\]`, "i").exec(header);
  return match?.[1]?.trim() || null;
}

function selected(value: string) {
  return Boolean(value.trim()) && !/^(false|0|no|tidak|-)$/.test(value.trim().toLowerCase());
}

async function main() {
  const [file, classNameArg] = process.argv.slice(2);
  if (!file || !classNameArg) throw new Error("Gunakan: npm run import:gform:kelas -- <file.csv> <kelas>");
  const className = classNameArg.trim().toUpperCase();
  const rows = parseCsv(await readFile(file, "utf8"));
  const headers = rows.shift() || [];
  const dateColumn = headers.findIndex((header) => header.trim().toUpperCase() === "TANGGAL");
  const recorderColumn = headers.findIndex((header) => header.trim().toUpperCase() === "NAMA GURU");
  if (dateColumn < 0 || recorderColumn < 0) throw new Error("CSV harus memiliki kolom NAMA GURU dan TANGGAL.");
  const statusColumns = headers.map((header, index) => {
    const status = statusFromHeader(header);
    const gridName = status ? gridStudentName(header, status) : null;
    return status ? { index, status, gridName: gridName && personKey(gridName) !== personKey(className) ? gridName : null } : null;
  }).filter((item): item is { index: number; status: Status; gridName: string | null } => Boolean(item));
  if (!statusColumns.length) throw new Error("CSV tidak memiliki kolom KETERANGAN SAKIT, IJIN/IZIN, atau ALPA.");

  const client = postgres(connectionString!, { max: 1, prepare: false });
  const db = drizzle(client);
  const [classRow] = await db.select({ id: schoolClasses.id, name: schoolClasses.name }).from(schoolClasses).where(eq(schoolClasses.name, className)).limit(1);
  if (!classRow) throw new Error(`Kelas ${className} tidak ditemukan.`);
  const teacherRows = await db.select({ id: teachers.id, name: teachers.name }).from(teachers);
  const userRows = await db.select({ id: users.id, teacherId: users.teacherId }).from(users);
  const userByTeacher = new Map(userRows.filter((user) => user.teacherId).map((user) => [user.teacherId!, user]));
  const [activeYear] = await db.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  const roster = await db.select({ id: students.id, name: students.name, studentNumber: students.studentNumber, isActive: students.isActive }).from(students).where(eq(students.classId, classRow.id));
  const studentByName = new Map(roster.map((student) => [personKey(student.name), student]));
  const usedNumbers = new Set(roster.map((student) => student.studentNumber).filter(Boolean));
  let imported = 0, createdStudents = 0, skipped = 0;

  await db.transaction(async (tx) => {
    for (const [rowIndex, row] of rows.entries()) {
      const date = dateValue(row[dateColumn] || "");
      const recorderSource = personKey(row[recorderColumn] || "");
      const recorderTeacher = teacherRows.find((teacher) => recorderSource.includes(personKey(teacher.name)));
      const recorder = recorderTeacher ? userByTeacher.get(recorderTeacher.id) : undefined;
      if (!recorder) throw new Error(`Akun guru piket tidak ditemukan pada baris ${rowIndex + 2}: ${row[recorderColumn] || "(kosong)"}`);
      for (const column of statusColumns) {
        const rawNames = column.gridName
          ? (selected(row[column.index] || "") ? [column.gridName] : [])
          : splitNames(row[column.index] || "");
        for (const rawName of rawNames) {
          const key = personKey(rawName);
          if (!key) continue;
          let student = studentByName.get(key);
          if (!student) {
            let studentNumber = `GF-${className}-${key.replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
            let suffix = 2;
            while (usedNumbers.has(studentNumber)) studentNumber = `GF-${className}-${key.slice(0, 24)}-${suffix++}`;
            const [created] = await tx.insert(students).values({ classId: classRow.id, name: rawName, studentNumber, status: "AKTIF", isActive: true }).returning({ id: students.id, name: students.name, studentNumber: students.studentNumber, isActive: students.isActive });
            student = created;
            studentByName.set(key, student);
            usedNumbers.add(studentNumber);
            createdStudents++;
          }
          if (!student.isActive) {
            await tx.update(students).set({ classId: classRow.id, status: "AKTIF", isActive: true, updatedAt: new Date() }).where(eq(students.id, student.id));
          }
          if (activeYear) await tx.insert(studentEnrollments).values({ studentId: student.id, classId: classRow.id, academicYearId: activeYear.id, outcome: "AKTIF" }).onConflictDoNothing();
          const existing = await tx.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.type, "SISWA"), eq(attendanceRecords.studentId, student.id), eq(attendanceRecords.attendanceDate, date), eq(attendanceRecords.status, column.status))).limit(1);
          if (existing.length) { skipped++; continue; }
          await tx.insert(attendanceRecords).values({ type: "SISWA", personName: student.name, studentId: student.id, classId: classRow.id, status: column.status, attendanceDate: date, notes: `Migrasi Google Form ${className} (baris ${rowIndex + 2}).`, isConfirmed: true, recordedBy: recorder.id });
          imported++;
        }
      }
    }
  });
  console.log(`Sinkronisasi ${className} selesai: ${imported} catatan baru, ${createdStudents} siswa baru, ${skipped} duplikat dilewati.`);
  await client.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
