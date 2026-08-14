import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { academicYears, dutySchedules, schoolClasses, studentEnrollments, students, teachers, users } from "../db/schema";
import { hashPassword } from "../lib/password";

loadEnvConfig(process.cwd());

const connectionString = process.env.DB_CONNECTION;
if (!connectionString) throw new Error("DB_CONNECTION belum diatur.");

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

const teacherSeeds = Array.from({ length: 22 }, (_, index) => ({
  name: `Guru ${String(index + 1).padStart(2, "0")}`,
  employeeNumber: `GTK-${String(index + 1).padStart(3, "0")}`,
  subject: ["Bahasa Indonesia", "Matematika", "IPA", "IPS", "Bahasa Inggris", "Pendidikan Agama", "Informatika", "PJOK"][(index) % 8],
  isDutyTeacher: index < 5,
}));

const classNames = ["7A", "7B", "7C", "7D", "8A", "8B", "8C", "8D", "8E", "8F", "8G", "9A", "9B", "9C", "9D", "9E"];

async function seed() {
  console.log("Menyiapkan data SMP IP YAKIN...");
  for (const teacher of teacherSeeds) {
    await db.insert(teachers).values(teacher).onConflictDoNothing();
  }

  const teacherRows = await db.select().from(teachers).orderBy(teachers.id);
  for (const name of classNames) {
    await db.insert(schoolClasses).values({ name, grade: Number(name[0]) }).onConflictDoNothing();
  }

  const classRows = await db.select().from(schoolClasses).orderBy(schoolClasses.grade, schoolClasses.name);
  const currentYearStart = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  await db.insert(academicYears).values({ name: `${currentYearStart}/${currentYearStart + 1}`, startYear: currentYearStart, endYear: currentYearStart + 1, isActive: true }).onConflictDoNothing();
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

  for (let index = 0; index < 5; index++) {
    const teacher = teacherRows[index];
    if (!teacher) continue;
    await db.insert(users).values({ teacherId: teacher.id, name: teacher.name, username: `piket${String(index + 1).padStart(2, "0")}`, passwordHash, role: "GURU_PIKET", mustChangePassword: true }).onConflictDoNothing();
    const [existingSchedule] = await db.select({ id: dutySchedules.id }).from(dutySchedules).where(and(eq(dutySchedules.teacherId, teacher.id), eq(dutySchedules.weekday, index + 1), eq(dutySchedules.shift, "PAGI"), eq(dutySchedules.isActive, true))).limit(1);
    if (!existingSchedule) await db.insert(dutySchedules).values({ teacherId: teacher.id, weekday: index + 1, shift: "PAGI", startTime: "06:30:00", endTime: index === 4 ? "11:30:00" : "14:00:00" });
  }

  const demoUsernames = ["admin", "kurikulum", "piket01", "piket02", "piket03", "piket04", "piket05"];
  await db.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(and(inArray(users.username, demoUsernames), isNull(users.passwordChangedAt)));

  console.log("Seed selesai: 22 guru, 5 guru piket, 16 kelas, roster demo siswa, 7 akun, dan jadwal Senin-Jumat.");
  console.log("Login admin: admin / SMPYakin#2026");
  console.log("Login wakasek kurikulum: kurikulum / SMPYakin#2026");
  await client.end();
}

seed().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
