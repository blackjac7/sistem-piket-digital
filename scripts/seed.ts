import { and, eq, ilike, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { academicYears, attendanceRecords, dutySchedules, schoolClasses, studentEnrollments, students, teachers, users } from "../db/schema";
import { hashPassword } from "../lib/password";
import { normalizeTeacherName, usernameFromTeacherName } from "../lib/teacher-names";

loadEnvConfig(process.cwd());

const connectionString = process.env.DB_CONNECTION;
if (!connectionString) throw new Error("DB_CONNECTION belum diatur.");

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

const dutyTeacherSeeds = [
  { name: normalizeTeacherName("SITI HUMAIROH, S.Pd"), username: usernameFromTeacherName("SITI HUMAIROH, S.Pd"), weekday: 1 },
  { name: normalizeTeacherName("INTAN MAHARANI, S.Pd"), username: usernameFromTeacherName("INTAN MAHARANI, S.Pd"), weekday: 2 },
  { name: normalizeTeacherName("MEGAWATI, S.Pd"), username: usernameFromTeacherName("MEGAWATI, S.Pd"), weekday: 3 },
  { name: normalizeTeacherName("WIWI ROHAYATI S.Pd"), username: usernameFromTeacherName("WIWI ROHAYATI S.Pd"), weekday: 4 },
  { name: normalizeTeacherName("UMI SULTRA, S.Pd"), username: usernameFromTeacherName("UMI SULTRA, S.Pd"), weekday: 5 },
] as const;

const dutyTeacherNames = new Set<string>(dutyTeacherSeeds.map((teacher) => teacher.name));

const teacherSeeds = [
  "SITI HUMAIROH, S.Pd",
  "INTAN MAHARANI, S.Pd",
  "MEGAWATI, S.Pd",
  "WIWI ROHAYATI S.Pd",
  "UMI SULTRA, S.Pd",
  "MUHAMAD ABDUH ST",
  "RETI SIBAGARIANG, S.Pd",
  "ABDULLOH SYAPII S.Pd",
  "HANNYSTIRA, S.Pd",
  "ILIM HILIMUDIN, S.Kom",
  "ARIF DARMAWAN, M.Pd",
  "Drs. SUBINO",
  "ETI FITRIAH S.Pd",
  "PETRA",
  "MEI MEGAWATI, S.Pd",
  "SAWITRI HANDAYANI, S.Pd",
  "ANITA PERMATASARI, S.Pd",
  "YUMELDA LISTIANA, S.Pd",
  "MARZUKI, S.Pd",
  "MUHAMMAD PEBRIAN SYAH, S.Pd",
  "ABDUL RAHMAN, S.Pd",
  "FEBRIANSYAH, S.Kom",
].map((name) => { const displayName = normalizeTeacherName(name); return { name: displayName, isDutyTeacher: dutyTeacherNames.has(displayName) }; });

type TeacherAttendanceStatus = "SAKIT" | "IZIN" | "ALPA";
type ImportedAbsence = { name: string; status: TeacherAttendanceStatus };

const googleFormResponses: Array<{ response: number; date: string; recordedBy: string; absences: ImportedAbsence[] }> = [
  { response: 1, date: "2026-07-20", recordedBy: "SITI HUMAIROH, S.Pd", absences: [] },
  { response: 2, date: "2026-07-21", recordedBy: "INTAN MAHARANI, S.Pd", absences: [] },
  { response: 3, date: "2026-07-23", recordedBy: "WIWI ROHAYATI S.Pd", absences: [{ name: "YUMELDA LISTIANA, S.Pd", status: "SAKIT" }, { name: "MUHAMAD ABDUH ST", status: "IZIN" }, { name: "INTAN MAHARANI, S.Pd", status: "IZIN" }] },
  { response: 4, date: "2026-07-23", recordedBy: "WIWI ROHAYATI S.Pd", absences: [{ name: "YUMELDA LISTIANA, S.Pd", status: "SAKIT" }, { name: "MUHAMAD ABDUH ST", status: "IZIN" }, { name: "INTAN MAHARANI, S.Pd", status: "IZIN" }] },
  { response: 5, date: "2026-07-24", recordedBy: "UMI SULTRA, S.Pd", absences: [{ name: "PETRA", status: "IZIN" }] },
  { response: 6, date: "2026-07-27", recordedBy: "SITI HUMAIROH, S.Pd", absences: [{ name: "ILIM HILIMUDIN, S.Kom", status: "SAKIT" }] },
  { response: 7, date: "2026-07-28", recordedBy: "INTAN MAHARANI, S.Pd", absences: [{ name: "MEGAWATI, S.Pd", status: "SAKIT" }, { name: "ILIM HILIMUDIN, S.Kom", status: "SAKIT" }, { name: "MEI MEGAWATI, S.Pd", status: "SAKIT" }] },
  { response: 8, date: "2026-07-28", recordedBy: "INTAN MAHARANI, S.Pd", absences: [{ name: "MEGAWATI, S.Pd", status: "SAKIT" }, { name: "ILIM HILIMUDIN, S.Kom", status: "SAKIT" }, { name: "MEI MEGAWATI, S.Pd", status: "IZIN" }] },
  { response: 9, date: "2026-07-30", recordedBy: "WIWI ROHAYATI S.Pd", absences: [{ name: "MEGAWATI, S.Pd", status: "SAKIT" }, { name: "MEI MEGAWATI, S.Pd", status: "SAKIT" }] },
  { response: 10, date: "2026-07-31", recordedBy: "UMI SULTRA, S.Pd", absences: [{ name: "MEGAWATI, S.Pd", status: "SAKIT" }, { name: "HANNYSTIRA, S.Pd", status: "IZIN" }] },
  { response: 11, date: "2026-08-03", recordedBy: "SITI HUMAIROH, S.Pd", absences: [] },
  { response: 12, date: "2026-08-04", recordedBy: "INTAN MAHARANI, S.Pd", absences: [{ name: "RETI SIBAGARIANG, S.Pd", status: "IZIN" }] },
  { response: 13, date: "2026-08-06", recordedBy: "WIWI ROHAYATI S.Pd", absences: [] },
  { response: 14, date: "2026-08-07", recordedBy: "UMI SULTRA, S.Pd", absences: [] },
  { response: 15, date: "2026-08-10", recordedBy: "SITI HUMAIROH, S.Pd", absences: [{ name: "UMI SULTRA, S.Pd", status: "SAKIT" }, { name: "MARZUKI, S.Pd", status: "SAKIT" }, { name: "SITI HUMAIROH, S.Pd", status: "SAKIT" }, { name: "FEBRIANSYAH, S.Kom", status: "SAKIT" }] },
  { response: 16, date: "2026-08-13", recordedBy: "WIWI ROHAYATI S.Pd", absences: [{ name: "MEGAWATI, S.Pd", status: "SAKIT" }, { name: "ARIF DARMAWAN, M.Pd", status: "IZIN" }, { name: "INTAN MAHARANI, S.Pd", status: "IZIN" }] },
  { response: 17, date: "2026-08-11", recordedBy: "INTAN MAHARANI, S.Pd", absences: [{ name: "MEGAWATI, S.Pd", status: "SAKIT" }] },
  { response: 18, date: "2026-08-14", recordedBy: "UMI SULTRA, S.Pd", absences: [{ name: "MEGAWATI, S.Pd", status: "SAKIT" }, { name: "ILIM HILIMUDIN, S.Kom", status: "ALPA" }] },
];

const classNames = ["7A", "7B", "7C", "7D", "8A", "8B", "8C", "8D", "8E", "8F", "8G", "9A", "9B", "9C", "9D", "9E"];

async function seed() {
  console.log("Menyiapkan data SMP IP YAKIN...");
  for (const [index, teacher] of teacherSeeds.entries()) {
    const [existingTeacher] = await db.select({ id: teachers.id }).from(teachers).where(ilike(teachers.name, teacher.name)).limit(1);
    if (existingTeacher) {
      await db.update(teachers).set({ name: teacher.name, isDutyTeacher: teacher.isDutyTeacher, isActive: true, updatedAt: new Date() }).where(eq(teachers.id, existingTeacher.id));
    } else {
      const placeholderName = `Guru ${String(index + 1).padStart(2, "0")}`;
      const [placeholderTeacher] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.name, placeholderName)).limit(1);
      if (placeholderTeacher) {
        await db.update(teachers).set({ name: teacher.name, employeeNumber: null, subject: null, isDutyTeacher: teacher.isDutyTeacher, isActive: true, updatedAt: new Date() }).where(eq(teachers.id, placeholderTeacher.id));
      } else {
        await db.insert(teachers).values(teacher);
      }
    }
  }

  const teacherRows = await db.select().from(teachers).orderBy(teachers.id);
  const teacherByName = new Map(teacherRows.map((teacher) => [teacher.name, teacher]));
  for (const name of classNames) {
    await db.insert(schoolClasses).values({ name, grade: Number(name[0]) }).onConflictDoNothing();
  }

  const classRows = await db.select().from(schoolClasses).orderBy(schoolClasses.grade, schoolClasses.name);
  const currentYearStart = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  await db.update(academicYears).set({ isActive: false }).where(eq(academicYears.isActive, true));
  await db.insert(academicYears).values({ name: `${currentYearStart}/${currentYearStart + 1}`, startYear: currentYearStart, endYear: currentYearStart + 1, isActive: true }).onConflictDoUpdate({ target: academicYears.name, set: { isActive: true } });
  const [activeYear] = await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  for (const schoolClass of classRows) {
    for (let index = 1; index <= 8; index++) {
      await db.insert(students).values({ classId: schoolClass.id, name: `Siswa ${schoolClass.name} ${String(index).padStart(2, "0")}`, studentNumber: `${schoolClass.id}-${String(index).padStart(3, "0")}` }).onConflictDoNothing();
    }
  }
  if (activeYear) {
    const studentRows = await db.select({ id: students.id, classId: students.classId }).from(students).where(eq(students.isActive, true));
    for (const student of studentRows) if (student.classId) await db.insert(studentEnrollments).values({ studentId: student.id, classId: student.classId, academicYearId: activeYear.id, outcome: "AKTIF" }).onConflictDoNothing();
  }

  const passwordHash = await hashPassword("SMPYakin#2026");
  await db.insert(users).values({ name: "Admin IT SMP IP YAKIN", username: "admin", passwordHash, role: "ADMIN", mustChangePassword: true }).onConflictDoUpdate({ target: users.username, set: { name: "Admin IT SMP IP YAKIN", role: "ADMIN", updatedAt: new Date() } });
  await db.insert(users).values({ name: "Wakasek Kurikulum", username: "kurikulum", passwordHash, role: "WAKASEK_KURIKULUM", mustChangePassword: true }).onConflictDoUpdate({ target: users.username, set: { name: "Wakasek Kurikulum", role: "WAKASEK_KURIKULUM", updatedAt: new Date() } });

  for (const dutyTeacher of dutyTeacherSeeds) {
    const teacher = teacherByName.get(dutyTeacher.name);
    if (!teacher) continue;
    const [existingAccount] = await db.select({ id: users.id }).from(users).where(eq(users.teacherId, teacher.id)).limit(1);
    if (existingAccount) {
      await db.update(users).set({ name: teacher.name, username: dutyTeacher.username, role: "GURU_PIKET", isActive: true, updatedAt: new Date() }).where(eq(users.id, existingAccount.id));
    } else {
      await db.insert(users).values({ teacherId: teacher.id, name: teacher.name, username: dutyTeacher.username, passwordHash, role: "GURU_PIKET", mustChangePassword: true }).onConflictDoUpdate({ target: users.username, set: { teacherId: teacher.id, name: teacher.name, role: "GURU_PIKET", isActive: true, updatedAt: new Date() } });
    }
    const [existingSchedule] = await db.select({ id: dutySchedules.id }).from(dutySchedules).where(and(eq(dutySchedules.weekday, dutyTeacher.weekday), eq(dutySchedules.isActive, true))).limit(1);
    if (!existingSchedule) await db.insert(dutySchedules).values({ teacherId: teacher.id, weekday: dutyTeacher.weekday, shift: "PAGI", startTime: "06:30:00", endTime: dutyTeacher.weekday === 5 ? "11:30:00" : "14:00:00" });
  }

  const dutyUserRows = await db.select({ id: users.id, teacherId: users.teacherId }).from(users).where(inArray(users.username, dutyTeacherSeeds.map((teacher) => teacher.username)));
  const dutyUserByTeacherId = new Map(dutyUserRows.filter((user) => user.teacherId).map((user) => [user.teacherId!, user]));
  const latestGoogleFormResponses = new Map<string, (typeof googleFormResponses)[number]>();
  for (const response of googleFormResponses) latestGoogleFormResponses.set(`${response.date}|${response.recordedBy}`, response);

  let importedAttendanceCount = 0;
  for (const response of latestGoogleFormResponses.values()) {
    const recorderTeacher = teacherByName.get(normalizeTeacherName(response.recordedBy));
    const recorder = recorderTeacher ? dutyUserByTeacherId.get(recorderTeacher.id) : undefined;
    if (!recorder) throw new Error(`Akun guru piket ${response.recordedBy} tidak ditemukan saat mengimpor Google Form.`);

    for (const absence of response.absences) {
      const absentTeacher = teacherByName.get(normalizeTeacherName(absence.name));
      if (!absentTeacher) throw new Error(`Guru ${absence.name} dari Google Form tidak ditemukan di seed.`);
      const [existingAttendance] = await db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.type, "GURU"), eq(attendanceRecords.teacherId, absentTeacher.id), eq(attendanceRecords.status, absence.status), eq(attendanceRecords.attendanceDate, response.date))).limit(1);
      if (existingAttendance) continue;
      await db.insert(attendanceRecords).values({
        type: "GURU",
        personName: absentTeacher.name,
        teacherId: absentTeacher.id,
        status: absence.status,
        attendanceDate: response.date,
        notes: `Migrasi Google Form laporan guru piket (respons #${response.response}).`,
        isConfirmed: true,
        recordedBy: recorder.id,
      });
      importedAttendanceCount++;
    }
  }

  const demoUsernames = ["admin", "kurikulum", ...dutyTeacherSeeds.map((teacher) => teacher.username)];
  await db.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(and(inArray(users.username, demoUsernames), isNull(users.passwordChangedAt)));

  console.log(`Seed selesai: 22 guru asli, 5 guru piket, 16 kelas, roster demo siswa, 7 akun, jadwal Senin-Jumat, dan ${importedAttendanceCount} absensi guru dari Google Form.`);
  console.log("Login admin: admin / SMPYakin#2026");
  console.log("Login wakasek kurikulum: kurikulum / SMPYakin#2026");
  await client.end();
}

seed().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
