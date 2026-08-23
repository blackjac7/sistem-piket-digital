import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { attendanceRecords, dutyCompletions, dutySchedules, schoolClasses, students, teachers, users } from "../db/schema";
import { normalizeTeacherName, usernameFromTeacherName } from "../lib/teacher-names";

loadEnvConfig(process.cwd());

type AttendanceStatus = "SAKIT" | "IZIN" | "ALPA";
type SourceKind = "SISWA" | "GURU";

type SourceRecord = {
  kind: SourceKind;
  className?: string;
  personName: string;
  date: string;
  status: AttendanceStatus;
  recorderName: string;
  sourceFile: string;
  sourceRow: number;
};

type SourceSubmission = {
  kind: SourceKind;
  className?: string;
  date: string;
  recorderName: string;
  submittedAt: Date | null;
  sourceFile: string;
  sourceRow: number;
};

type ParsedFile = {
  fileName: string;
  records: SourceRecord[];
  submissions: SourceSubmission[];
  responseCount: number;
  supersededResponses: number;
  warnings: string[];
};

type SyncOptions = {
  inputPath: string;
  apply: boolean;
  json: boolean;
};

type StudentRow = {
  id: number;
  name: string;
  classId: number | null;
  className: string | null;
  isActive: boolean;
  status: "AKTIF" | "LULUS" | "PINDAH";
};

type TeacherRow = { id: number; name: string; isActive: boolean };
type UserRow = { id: number; teacherId: number | null; role: string; isActive: boolean };

const CLASS_FILE_PATTERN = /GURU PIKET\s+([789][A-G])\.csv$/i;
const TEACHER_FILE_PATTERN = /KEHADIRAN GURU\.csv$/i;
const EMPTY_MARKER = /^(?:tidak\s*ada|tidak|false|0|no|-)$/i;
const EXPECTED_SCOPES = ["7A", "7B", "7C", "7D", "8A", "8B", "8C", "8D", "8E", "8F", "8G", "9A", "9B", "9C", "9D", "9E", "GURU"];

function usage(): never {
  throw new Error([
    "Gunakan: npm run sync:gform -- <folder|file.csv|file.zip> [--apply] [--json]",
    "Default hanya audit (dry-run). Tambahkan --apply untuk menulis ke database.",
  ].join("\n"));
}

function parseArgs(argv: string[]): SyncOptions {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  if (positional.length !== 1) usage();
  return {
    inputPath: positional[0],
    apply: argv.includes("--apply"),
    json: argv.includes("--json"),
  };
}

function personKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCell(value: string | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function splitNames(value: string | undefined) {
  return cleanCell(value)
    .split(/[;\n]/)
    .map((name) => cleanCell(name))
    .filter((name) => name && !EMPTY_MARKER.test(name));
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function dateValue(value: string) {
  const source = cleanCell(value).replace(/^\uFEFF/, "");
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(source);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(source);
  if (!slash) throw new Error(`Tanggal tidak valid: ${value}`);
  const first = Number(slash[1]);
  const second = Number(slash[2]);
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error(`Tanggal tidak valid: ${value}`);
  return `${slash[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function timestampValue(value: string) {
  const source = cleanCell(value);
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)\s+GMT([+-]\d{1,2})(?::?(\d{2}))?$/i.exec(source);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const period = match[7].toUpperCase();
  const offsetHours = Number(match[8]);
  const offsetMinutes = Number(match[9] || "0");
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 1 || hour > 12 || minute > 59 || second > 59 || offsetMinutes > 59) return null;
  if (period === "AM" && hour === 12) hour = 0;
  if (period === "PM" && hour !== 12) hour += 12;
  const offset = (offsetHours < 0 ? -1 : 1) * (Math.abs(offsetHours) * 60 + offsetMinutes);
  const timestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function weekdayForDate(value: string) {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function statusFromHeader(header: string): AttendanceStatus | null {
  const upper = header.toUpperCase();
  if (upper.includes("SAKIT")) return "SAKIT";
  if (upper.includes("IJIN") || upper.includes("IZIN")) return "IZIN";
  if (upper.includes("ALPA")) return "ALPA";
  return null;
}

function parseCsvFile(fileName: string, input: string): ParsedFile {
  const rows = parseCsv(input.replace(/^\uFEFF/, ""));
  const headers = rows.shift() || [];
  const timestampColumn = headers.findIndex((header) => cleanCell(header).toUpperCase() === "TIMESTAMP");
  const dateColumn = headers.findIndex((header) => cleanCell(header).toUpperCase() === "TANGGAL");
  const recorderColumn = headers.findIndex((header) => cleanCell(header).toUpperCase() === "NAMA GURU");
  if (timestampColumn < 0 || dateColumn < 0 || recorderColumn < 0) throw new Error(`${fileName}: CSV harus memiliki kolom Timestamp, NAMA GURU, dan TANGGAL.`);

  const classMatch = CLASS_FILE_PATTERN.exec(fileName);
  const isTeacherFile = TEACHER_FILE_PATTERN.test(fileName);
  if (!classMatch && !isTeacherFile) throw new Error(`${fileName}: nama file tidak menunjukkan kelas atau laporan kehadiran guru.`);
  const className = classMatch?.[1]?.toUpperCase();
  const kind: SourceKind = className ? "SISWA" : "GURU";
  const statusColumns = headers
    .map((header, index) => ({ index, status: statusFromHeader(header) }))
    .filter((item): item is { index: number; status: AttendanceStatus } => Boolean(item.status));
  if (!statusColumns.length) throw new Error(`${fileName}: tidak ada kolom status SAKIT, IJIN/IZIN, atau ALPA.`);

  const records: SourceRecord[] = [];
  const submissions: SourceSubmission[] = [];
  const warnings: string[] = [];
  const latestRows = new Map<string, { row: string[]; rowIndex: number; date: string; recorderName: string; submittedAt: Date | null }>();
  for (const [rowIndex, row] of rows.entries()) {
    const date = dateValue(row[dateColumn] || "");
    const recorderName = cleanCell(row[recorderColumn]);
    const submittedAt = timestampValue(row[timestampColumn] || "");
    if (!recorderName) warnings.push(`${fileName} baris ${rowIndex + 2}: nama pencatat kosong.`);
    if (!submittedAt) warnings.push(`${fileName} baris ${rowIndex + 2}: Timestamp tidak valid.`);
    const current = latestRows.get(date);
    const isLater = !current || (submittedAt && current.submittedAt ? submittedAt > current.submittedAt : rowIndex > current.rowIndex);
    if (isLater) latestRows.set(date, { row, rowIndex, date, recorderName, submittedAt });
  }
  const selectedRows = [...latestRows.values()].sort((left, right) => left.rowIndex - right.rowIndex);
  for (const selected of selectedRows) {
    submissions.push({ kind, className, date: selected.date, recorderName: selected.recorderName, submittedAt: selected.submittedAt, sourceFile: fileName, sourceRow: selected.rowIndex + 2 });
    for (const column of statusColumns) {
      for (const personName of splitNames(selected.row[column.index])) {
        const record: SourceRecord = { kind, className, personName, date: selected.date, status: column.status, recorderName: selected.recorderName, sourceFile: fileName, sourceRow: selected.rowIndex + 2 };
        records.push(record);
      }
    }
  }
  return { fileName, records, submissions, responseCount: rows.length, supersededResponses: rows.length - selectedRows.length, warnings };
}

async function csvFilesFromInput(inputPath: string) {
  const resolved = path.resolve(inputPath);
  const info = await stat(resolved);
  if (info.isDirectory()) {
    const names = (await readdir(resolved)).filter((name) => /\.(?:csv|zip)$/i.test(name)).sort();
    return names.map((name) => path.join(resolved, name));
  }
  return [resolved];
}

async function readInputFile(filePath: string) {
  const buffer = await readFile(filePath);
  if (!filePath.toLowerCase().endsWith(".zip")) return [{ fileName: path.basename(filePath), text: buffer.toString("utf8") }];
  const zip = await JSZip.loadAsync(buffer);
  const entries: Array<{ fileName: string; text: string }> = [];
  for (const [entryName, entry] of Object.entries(zip.files)) {
    if (entry.dir || !entryName.toLowerCase().endsWith(".csv")) continue;
    entries.push({ fileName: path.basename(entryName), text: await entry.async("string") });
  }
  return entries;
}

async function loadSource(inputPath: string) {
  const files = await csvFilesFromInput(inputPath);
  const parsed: ParsedFile[] = [];
  for (const file of files) {
    for (const source of await readInputFile(file)) parsed.push(parseCsvFile(source.fileName, source.text));
  }
  if (!parsed.length) throw new Error("Tidak ada CSV yang dapat dibaca dari input.");
  return parsed;
}

function canonicalTeacherKey(value: string) {
  const normalized = normalizeTeacherName(value);
  return usernameFromTeacherName(normalized) || personKey(normalized);
}

function formScope(fileName: string) {
  return CLASS_FILE_PATTERN.exec(fileName)?.[1]?.toUpperCase() || (TEACHER_FILE_PATTERN.test(fileName) ? "GURU" : fileName);
}

function recordKey(record: { kind: SourceKind; studentId?: number | null; teacherId?: number | null; date: string; status: string }) {
  return `${record.kind}|${record.kind === "SISWA" ? record.studentId : record.teacherId}|${record.date}|${record.status}`;
}

function formatCounts(records: SourceRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const label = record.kind === "SISWA" ? record.className || "?" : "GURU";
    counts.set(`${label}|${record.status}`, (counts.get(`${label}|${record.status}`) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort().map(([key, count]) => [key, count]));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const parsedFiles = await loadSource(options.inputPath);
  const sourceScopes = new Set(parsedFiles.map((file) => formScope(file.fileName)));
  const fullDataset = EXPECTED_SCOPES.every((scope) => sourceScopes.has(scope));
  const rawRecords = parsedFiles.flatMap((file) => file.records);
  const uniqueSource = new Map<string, SourceRecord>();
  const duplicateSourceRecords: SourceRecord[] = [];
  for (const record of rawRecords) {
    const identity = `${record.kind}|${record.className || ""}|${personKey(record.personName)}|${record.date}|${record.status}`;
    if (uniqueSource.has(identity)) duplicateSourceRecords.push(record);
    else uniqueSource.set(identity, record);
  }
  const sourceRecords = [...uniqueSource.values()];
  const sourceConflicts = new Map<string, SourceRecord[]>();
  for (const record of sourceRecords) {
    const identity = `${record.kind}|${record.className || ""}|${personKey(record.personName)}|${record.date}`;
    const list = sourceConflicts.get(identity) || [];
    list.push(record);
    sourceConflicts.set(identity, list);
  }
  const conflicts = [...sourceConflicts.values()].filter((list) => new Set(list.map((record) => record.status)).size > 1);

  const connectionString = process.env.DB_CONNECTION;
  if (!connectionString) throw new Error("DB_CONNECTION belum diatur.");
  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client);
  try {
    const [studentRows, teacherRows, userRows, classRows, scheduleRows, completionRows, attendanceRows] = await Promise.all([
      db.select({ id: students.id, name: students.name, classId: students.classId, className: schoolClasses.name, isActive: students.isActive, status: students.status }).from(students).leftJoin(schoolClasses, eq(students.classId, schoolClasses.id)),
      db.select({ id: teachers.id, name: teachers.name, isActive: teachers.isActive }).from(teachers),
      db.select({ id: users.id, teacherId: users.teacherId, role: users.role, isActive: users.isActive }).from(users),
      db.select({ id: schoolClasses.id, name: schoolClasses.name }).from(schoolClasses),
      db.select({ id: dutySchedules.id, teacherId: dutySchedules.teacherId, weekday: dutySchedules.weekday, shift: dutySchedules.shift, isActive: dutySchedules.isActive }).from(dutySchedules),
      db.select({ id: dutyCompletions.id, teacherId: dutyCompletions.teacherId, dutyDate: dutyCompletions.dutyDate, shift: dutyCompletions.shift }).from(dutyCompletions),
      db.select({ id: attendanceRecords.id, type: attendanceRecords.type, studentId: attendanceRecords.studentId, teacherId: attendanceRecords.teacherId, attendanceDate: attendanceRecords.attendanceDate, status: attendanceRecords.status, notes: attendanceRecords.notes }).from(attendanceRecords),
    ]);
    const classByName = new Map(classRows.map((row) => [row.name.toUpperCase(), row]));
    const studentByClassAndName = new Map<string, StudentRow>();
    for (const student of studentRows) {
      if (student.className) studentByClassAndName.set(`${student.className.toUpperCase()}|${personKey(student.name)}`, student);
    }
    const teacherByName = new Map<string, TeacherRow>();
    for (const teacher of teacherRows) teacherByName.set(canonicalTeacherKey(teacher.name), teacher);
    const recorderByTeacherId = new Map<number, UserRow>();
    for (const user of userRows) {
      if (user.teacherId && user.isActive && (user.role === "GURU_PIKET" || user.role === "ADMIN")) recorderByTeacherId.set(user.teacherId, user);
    }

    const unresolved: string[] = [];
    const matchedRecords: Array<{ source: SourceRecord; subjectId: number; recorderId: number; classId: number | null; student?: StudentRow; teacher?: TeacherRow }> = [];
    for (const record of sourceRecords) {
      let subjectId: number | undefined;
      let classId: number | null = null;
      let student: StudentRow | undefined;
      let teacher: TeacherRow | undefined;
      if (record.kind === "SISWA") {
        const classRow = record.className ? classByName.get(record.className) : undefined;
        classId = classRow?.id ?? null;
        student = record.className ? studentByClassAndName.get(`${record.className}|${personKey(record.personName)}`) : undefined;
        if (!classRow) unresolved.push(`${record.sourceFile} baris ${record.sourceRow}: kelas ${record.className} tidak ditemukan.`);
        if (!student) unresolved.push(`${record.sourceFile} baris ${record.sourceRow}: siswa ${record.personName} (${record.className}) tidak ditemukan.`);
        if (student) subjectId = student.id;
      } else {
        teacher = teacherByName.get(canonicalTeacherKey(record.personName));
        if (!teacher) unresolved.push(`${record.sourceFile} baris ${record.sourceRow}: guru ${record.personName} tidak ditemukan.`);
        if (teacher) subjectId = teacher.id;
      }
      const recorderTeacher = teacherByName.get(canonicalTeacherKey(record.recorderName));
      const recorder = recorderTeacher ? recorderByTeacherId.get(recorderTeacher.id) : undefined;
      if (!recorder) unresolved.push(`${record.sourceFile} baris ${record.sourceRow}: akun pencatat ${record.recorderName || "(kosong)"} tidak ditemukan.`);
      if (subjectId && recorder) {
        matchedRecords.push({ source: record, subjectId, recorderId: recorder.id, classId, student, teacher });
      }
    }

    const existingByKey = new Map<string, (typeof attendanceRows)[number]>();
    const existingGroups = new Map<string, (typeof attendanceRows)[number][]>();
    const existingPersonDates = new Map<string, (typeof attendanceRows)[number][]>();
    for (const row of attendanceRows) {
      const subjectId = row.type === "SISWA" ? row.studentId : row.teacherId;
      if (!subjectId) continue;
      const key = recordKey({ kind: row.type, studentId: row.studentId, teacherId: row.teacherId, date: row.attendanceDate, status: row.status });
      existingByKey.set(key, row);
      const group = existingGroups.get(key) || [];
      group.push(row);
      existingGroups.set(key, group);
      const personDateKey = `${row.type}|${subjectId}|${row.attendanceDate}`;
      const personDateGroup = existingPersonDates.get(personDateKey) || [];
      personDateGroup.push(row);
      existingPersonDates.set(personDateKey, personDateGroup);
    }
    const matchedByKey = new Map<string, (typeof matchedRecords)[number]>();
    for (const item of matchedRecords) {
      const key = recordKey({ kind: item.source.kind, studentId: item.source.kind === "SISWA" ? item.subjectId : null, teacherId: item.source.kind === "GURU" ? item.subjectId : null, date: item.source.date, status: item.source.status });
      if (!matchedByKey.has(key)) matchedByKey.set(key, item);
    }
    const resolvedRecords = [...matchedByKey.values()];
    const toInsert = resolvedRecords.filter((item) => !existingByKey.has(recordKey({ kind: item.source.kind, studentId: item.source.kind === "SISWA" ? item.subjectId : null, teacherId: item.source.kind === "GURU" ? item.subjectId : null, date: item.source.date, status: item.source.status })));
    const alreadyPresent = resolvedRecords.length - toInsert.length;
    const resolvedSourceKeys = new Set(matchedByKey.keys());
    const staleGoogleFormRecords = fullDataset ? attendanceRows.filter((row) => {
      if (!row.notes?.startsWith("Migrasi Google Form")) return false;
      const subjectId = row.type === "SISWA" ? row.studentId : row.teacherId;
      if (!subjectId) return true;
      return !resolvedSourceKeys.has(recordKey({ kind: row.type, studentId: row.studentId, teacherId: row.teacherId, date: row.attendanceDate, status: row.status }));
    }) : [];
    const databaseDuplicates = [...existingGroups.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, ids: rows.map((row) => row.id) }));
    const databaseStatusConflicts = [...existingPersonDates.entries()].filter(([, rows]) => new Set(rows.map((row) => row.status)).size > 1).map(([key, rows]) => ({ key, statuses: [...new Set(rows.map((row) => row.status))], ids: rows.map((row) => row.id) }));
    const unlinkedAttendance = attendanceRows.filter((row) => row.type === "SISWA" ? !row.studentId : !row.teacherId);
    const submissionsByDate = new Map<string, SourceSubmission[]>();
    for (const file of parsedFiles) {
      for (const submission of file.submissions) {
        const list = submissionsByDate.get(submission.date) || [];
        list.push(submission);
        submissionsByDate.set(submission.date, list);
      }
    }
    const selectedSubmissions = new Map<string, SourceSubmission>();
    const completionIssues: string[] = [];
    for (const [date, submissions] of submissionsByDate) {
      const recorderKeys = new Set(submissions.map((submission) => canonicalTeacherKey(submission.recorderName)));
      if (recorderKeys.size > 1) {
        completionIssues.push(`${date}: terdapat lebih dari satu guru pencatat (${[...new Set(submissions.map((submission) => submission.recorderName))].join(", ")}).`);
        continue;
      }
      const teacherSubmissions = submissions.filter((submission) => submission.kind === "GURU");
      const candidates = teacherSubmissions.length ? teacherSubmissions : submissions;
      candidates.sort((left, right) => (right.submittedAt?.getTime() || 0) - (left.submittedAt?.getTime() || 0));
      selectedSubmissions.set(date, candidates[0]);
    }
    const scheduleByTeacherDay = new Map<string, (typeof scheduleRows)[number]>();
    for (const schedule of scheduleRows) if (schedule.isActive) scheduleByTeacherDay.set(`${schedule.teacherId}|${schedule.weekday}`, schedule);
    const existingCompletionKeys = new Set(completionRows.map((completion) => `${completion.teacherId}|${completion.dutyDate}|${completion.shift}`));
    const toComplete: Array<{ submission: SourceSubmission; teacherId: number; completedBy: number; scheduleId: number; shift: (typeof scheduleRows)[number]["shift"] }> = [];
    for (const submission of selectedSubmissions.values()) {
      const recorderTeacher = teacherByName.get(canonicalTeacherKey(submission.recorderName));
      if (!recorderTeacher) {
        completionIssues.push(`${submission.sourceFile} baris ${submission.sourceRow}: guru pencatat ${submission.recorderName} tidak ditemukan untuk penyelesaian piket.`);
        continue;
      }
      const recorder = recorderByTeacherId.get(recorderTeacher.id);
      if (!recorder) {
        completionIssues.push(`${submission.sourceFile} baris ${submission.sourceRow}: akun aktif ${recorderTeacher.name} tidak ditemukan untuk penyelesaian piket.`);
        continue;
      }
      const schedule = scheduleByTeacherDay.get(`${recorderTeacher.id}|${weekdayForDate(submission.date)}`);
      if (!schedule) {
        completionIssues.push(`${submission.sourceFile} baris ${submission.sourceRow}: ${recorderTeacher.name} tidak memiliki jadwal piket aktif untuk ${submission.date}.`);
        continue;
      }
      const key = `${recorderTeacher.id}|${submission.date}|${schedule.shift}`;
      if (!existingCompletionKeys.has(key)) toComplete.push({ submission, teacherId: recorderTeacher.id, completedBy: recorder.id, scheduleId: schedule.id, shift: schedule.shift });
    }
    const report = {
      input: path.resolve(options.inputPath),
      fullDataset,
      files: parsedFiles.map((file) => ({ file: file.fileName, responses: file.responseCount, supersededResponses: file.supersededResponses, rawRecords: file.records.length, warnings: file.warnings })),
      rawRecords: rawRecords.length,
      uniqueRecords: sourceRecords.length,
      resolvedRecords: resolvedRecords.length,
      duplicateSourceRecords: duplicateSourceRecords.length,
      sourceConflicts: conflicts.map((list) => list.map((record) => ({ file: record.sourceFile, row: record.sourceRow, person: record.personName, className: record.className, date: record.date, status: record.status }))),
      counts: formatCounts(sourceRecords),
      unresolved: [...new Set(unresolved)],
      alreadyPresent,
      toInsert: toInsert.length,
      dutyCompletions: {
        existing: completionRows.length,
        toInsert: toComplete.length,
        issues: [...new Set(completionIssues)],
      },
      databaseAudit: {
        totalAttendance: attendanceRows.length,
        duplicateGroups: databaseDuplicates,
        statusConflicts: databaseStatusConflicts,
        unlinkedAttendance: unlinkedAttendance.map((row) => row.id),
        staleGoogleFormRecords: { checked: fullDataset, ids: staleGoogleFormRecords.map((row) => row.id) },
      },
      staleGoogleFormCount: staleGoogleFormRecords.length,
      roster: {
        activeStudents: studentRows.filter((student) => student.isActive).length,
        observedStudentNames: new Set(sourceRecords.filter((record) => record.kind === "SISWA").map((record) => `${record.className}|${personKey(record.personName)}`)).size,
      },
    };

    const blockingIssues = report.unresolved.length + report.dutyCompletions.issues.length;
    if (options.apply && blockingIssues) throw new Error(`Sinkronisasi dibatalkan karena ${blockingIssues} masalah referensi/jadwal. Jalankan dry-run untuk melihat detail.`);
    if (options.apply && (toInsert.length + toComplete.length + staleGoogleFormRecords.length)) {
      await db.transaction(async (tx) => {
        if (staleGoogleFormRecords.length) {
          await tx.delete(attendanceRecords).where(inArray(attendanceRecords.id, staleGoogleFormRecords.map((row) => row.id)));
        }
        for (const item of toInsert) {
          await tx.insert(attendanceRecords).values({
            type: item.source.kind,
            personName: item.source.kind === "SISWA" ? item.student?.name || item.source.personName : item.teacher?.name || item.source.personName,
            studentId: item.source.kind === "SISWA" ? item.student?.id || item.subjectId : null,
            classId: item.source.kind === "SISWA" ? item.classId : null,
            teacherId: item.source.kind === "GURU" ? item.subjectId : null,
            status: item.source.status,
            attendanceDate: item.source.date,
            notes: `Migrasi Google Form ${item.source.className || "guru"} (file ${item.source.sourceFile}, baris ${item.source.sourceRow}).`,
            isConfirmed: true,
            recordedBy: item.recorderId,
          });
        }
        for (const item of toComplete) {
          await tx.insert(dutyCompletions).values({ scheduleId: item.scheduleId, teacherId: item.teacherId, completedBy: item.completedBy, dutyDate: item.submission.date, shift: item.shift, completedAt: item.submission.submittedAt || new Date(`${item.submission.date}T07:00:00.000Z`) });
        }
      });
    }
    if (options.json) console.log(JSON.stringify({ ...report, applied: options.apply, inserted: options.apply ? toInsert.length : 0, deletedStale: options.apply ? staleGoogleFormRecords.length : 0, dutyCompletionsInserted: options.apply ? toComplete.length : 0 }, null, 2));
    else {
      console.log(`GForm: ${sourceRecords.length} record unik dari ${parsedFiles.length} CSV (${duplicateSourceRecords.length} duplikat sumber dilewati).`);
      console.log(`Sudah ada: ${alreadyPresent}; akan ditambahkan: ${toInsert.length}; masalah referensi: ${report.unresolved.length}.`);
      console.log(`Konflik status sumber: ${report.sourceConflicts.length}.`);
      if (options.apply) console.log(`Transaksi selesai: ${toInsert.length} catatan absensi ditambahkan, ${staleGoogleFormRecords.length} catatan stale dihapus, dan ${toComplete.length} penyelesaian piket ditambahkan.`);
      if (report.unresolved.length) for (const issue of report.unresolved) console.log(`- ${issue}`);
      if (report.sourceConflicts.length) console.log("- Konflik status dipertahankan sesuai sumber; periksa laporan JSON bila perlu.");
      if (report.dutyCompletions.issues.length) for (const issue of report.dutyCompletions.issues) console.log(`- ${issue}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
