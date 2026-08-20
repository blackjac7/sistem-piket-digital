"use server";

import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { academicYears, attendanceRecords, auditLogs, dutyCompletions, dutySchedules, passkeys, schoolClasses, sessions, studentEnrollments, students, teachers, users } from "@/db/schema";
import { createSession, deleteSession, destinationForUser, requireAdmin, requireRoles, requireUser } from "@/lib/auth";
import { loadWorkbook } from "@/lib/excel";
import { generateTemporaryPassword, hashPassword, needsPasswordRehash, validateNewPassword, verifyPassword } from "@/lib/password";
import { internalErrorMessage, isUniqueViolation, reportServerError } from "@/lib/server-errors";
import { normalizeTeacherName, usernameFromTeacherName, usernamePattern } from "@/lib/teacher-names";
import { weekdayNames } from "@/lib/utils";

export type ActionState = { error?: string; success?: string; temporaryPassword?: string; accountName?: string };

const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$lKgye5eVW7udIg3/0ryKVA$dLHO8+hRzTnP9HunQJNYYfC475qWyoZyK4m2icugSbw";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const mutationRequestSchema = z.string().uuid();

function mutationRequestId(formData: FormData) {
  return mutationRequestSchema.safeParse(formData.get("requestId"));
}

const loginSchema = z.object({
  username: z.string().trim().min(3, "Username minimal 3 karakter."),
  password: z.string().min(1, "Kata sandi wajib diisi."),
});

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await db.select().from(users).where(eq(users.username, parsed.data.username.toLowerCase())).limit(1);
  const user = result[0];
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Terlalu banyak percobaan login. Coba kembali dalam beberapa menit." };
  }

  const passwordValid = await verifyPassword(user?.passwordHash || DUMMY_PASSWORD_HASH, parsed.data.password);
  if (!user || !user.isActive || !passwordValid) {
    if (user?.isActive) {
      const failedLoginAttempts = user.failedLoginAttempts + 1;
      await db.update(users).set({
        failedLoginAttempts: failedLoginAttempts >= MAX_LOGIN_ATTEMPTS ? 0 : failedLoginAttempts,
        lockedUntil: failedLoginAttempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null,
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));
    }
    return { error: "Username atau kata sandi tidak benar." };
  }

  const upgradedHash = needsPasswordRehash(user.passwordHash) ? await hashPassword(parsed.data.password) : undefined;
  await createSession(user.id);
  const [passkeyCount] = await db.select({ value: count() }).from(passkeys).where(eq(passkeys.userId, user.id));
  const shouldOfferPasskey = !user.mustChangePassword && user.role === "GURU_PIKET" && !user.passkeyPromptedAt && passkeyCount.value === 0;
  await db.update(users).set({ passwordHash: upgradedHash, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  await db.insert(auditLogs).values({ userId: user.id, action: "LOGIN", entity: "SESSION", description: `${user.name} masuk ke sistem.` });
  redirect(shouldOfferPasskey ? "/onboarding/passkey" : destinationForUser(user));
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Kata sandi saat ini wajib diisi."),
  newPassword: z.string().min(1, "Kata sandi baru wajib diisi."),
  confirmPassword: z.string().min(1, "Konfirmasi kata sandi wajib diisi."),
});

export async function changeOwnPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await requireUser({ allowPasswordChange: true });
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.newPassword !== parsed.data.confirmPassword) return { error: "Konfirmasi kata sandi baru tidak sama." };

  const [account] = await db.select().from(users).where(eq(users.id, currentUser.id)).limit(1);
  if (!account || !(await verifyPassword(account.passwordHash, parsed.data.currentPassword))) {
    return { error: "Kata sandi saat ini tidak benar." };
  }
  if (await verifyPassword(account.passwordHash, parsed.data.newPassword)) return { error: "Kata sandi baru harus berbeda dari kata sandi saat ini." };
  const validationError = validateNewPassword(parsed.data.newPassword, account);
  if (validationError) return { error: validationError };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, account.id));
    await tx.delete(sessions).where(eq(sessions.userId, account.id));
    await tx.insert(auditLogs).values({ userId: account.id, action: "CHANGE_PASSWORD", entity: "USER", entityId: String(account.id), description: `${account.name} mengganti kata sandi akun sendiri dan mengakhiri sesi lain.` });
  });
  await createSession(account.id);
  redirect(destinationForUser({ ...account, mustChangePassword: false }));
}

export async function resetUserPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const requestId = mutationRequestId(formData);
  const targetId = z.coerce.number().int().positive().safeParse(formData.get("userId"));
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  if (!targetId.success) return { error: "Akun tidak valid." };
  if (targetId.data === admin.id) return { error: "Gunakan menu Ubah kata sandi untuk akun Admin IT Anda sendiri." };

  const [target] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, targetId.data)).limit(1);
  if (!target) return { error: "Akun tidak ditemukan." };
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: admin.id, action: "RESET_PASSWORD", entity: "USER", entityId: String(target.id), description: `${admin.name} mereset kata sandi ${target.name}; seluruh sesi akun tersebut diakhiri.` });
      await tx.update(users).set({ passwordHash, mustChangePassword: true, passwordChangedAt: null, failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, target.id));
      await tx.delete(sessions).where(eq(sessions.userId, target.id));
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { error: "Permintaan reset yang sama sudah diproses. Muat ulang data akun sebelum melakukan reset baru." };
    return { error: internalErrorMessage(reportServerError("reset-user-password", error)) };
  }
  revalidatePath("/accounts");
  return { success: "Kata sandi sementara berhasil dibuat.", temporaryPassword, accountName: target.name };
}

export async function skipPasskeyOnboardingAction() {
  const user = await requireUser();
  await db.update(users).set({ passkeyPromptedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  await db.insert(auditLogs).values({ userId: user.id, action: "SKIP", entity: "PASSKEY_ONBOARDING", description: `${user.name} memilih mengaktifkan passkey nanti.` });
  redirect("/dashboard");
}

export async function logoutAction() {
  const user = await requireUser({ allowPasswordChange: true });
  await db.insert(auditLogs).values({ userId: user.id, action: "LOGOUT", entity: "SESSION", description: `${user.name} keluar dari sistem.` });
  await deleteSession();
  redirect("/login");
}

export async function completeDutyAction(formData: FormData) {
  const user = await requireRoles(["GURU_PIKET"]);
  if (!user.teacherId) return;
  const scheduleId = z.coerce.number().int().positive().parse(formData.get("scheduleId"));
  const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date());
  const weekday = new Date(`${today}T12:00:00+07:00`).getUTCDay();
  const [schedule] = await db.select({ id: dutySchedules.id, shift: dutySchedules.shift }).from(dutySchedules).where(and(eq(dutySchedules.id, scheduleId), eq(dutySchedules.teacherId, user.teacherId), eq(dutySchedules.weekday, weekday), eq(dutySchedules.isActive, true))).limit(1);
  if (!schedule) return;
  const inserted = await db.insert(dutyCompletions).values({ scheduleId: schedule.id, teacherId: user.teacherId, completedBy: user.id, dutyDate: today, shift: schedule.shift }).onConflictDoNothing().returning({ id: dutyCompletions.id });
  if (!inserted.length) return;
  await db.insert(auditLogs).values({ userId: user.id, action: "COMPLETE", entity: "DUTY", entityId: String(schedule.id), description: `${user.name} menandai tugas piket ${today} selesai.` });
  revalidatePath("/dashboard");
  revalidatePath("/monitoring");
}

const attendanceSchema = z.object({
  type: z.enum(["SISWA", "GURU"]),
  status: z.enum(["SAKIT", "IZIN", "ALPA", "DINAS"]),
  attendanceDate: z.string().date(),
  notes: z.string().trim().max(1000).optional(),
  isConfirmed: z.string().optional(),
});

export async function createAttendanceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!(["ADMIN", "GURU_PIKET"] as const).includes(user.role as "ADMIN" | "GURU_PIKET")) return { error: "Akses ditolak." };
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  const parsed = attendanceSchema.safeParse({
    type: formData.get("type"),
    status: formData.get("status"),
    attendanceDate: formData.get("attendanceDate"),
    notes: formData.get("notes") || undefined,
    isConfirmed: formData.get("isConfirmed") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const parsedPersonIds = z.array(z.coerce.number().int().positive()).min(1).max(100).safeParse(formData.getAll("personId"));
  if (!parsedPersonIds.success) return { error: `Pilih 1-100 ${parsed.data.type === "SISWA" ? "siswa" : "guru"} yang valid.` };
  const personIds = [...new Set(parsedPersonIds.data)];
  type AttendancePerson = { id: number; name: string; classId: number | null; studentId: number | null; teacherId: number | null };
  let people: AttendancePerson[];
  if (parsed.data.type === "SISWA") {
    const rows = await db.select({ id: students.id, name: students.name, classId: students.classId }).from(students).where(and(eq(students.isActive, true), inArray(students.id, personIds)));
    people = rows.map((row) => ({ id: row.id, name: row.name, classId: row.classId, studentId: row.id, teacherId: null }));
  } else {
    const rows = await db.select({ id: teachers.id, name: teachers.name }).from(teachers).where(and(eq(teachers.isActive, true), inArray(teachers.id, personIds)));
    people = rows.map((row) => ({ id: row.id, name: row.name, classId: null, studentId: null, teacherId: row.id }));
  }
  if (people.length !== personIds.length) return { error: "Sebagian data yang dipilih tidak ditemukan atau sudah tidak aktif. Muat ulang halaman lalu pilih kembali." };

  try {
    await db.transaction(async (tx) => {
      const [audit] = await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "CREATE", entity: "ATTENDANCE", description: `Mencatat ${people.length} ${parsed.data.type === "SISWA" ? "siswa" : "guru"} dengan status ${parsed.data.status}.` }).returning({ id: auditLogs.id });
      const records = await tx.insert(attendanceRecords).values(people.map((person) => ({
        type: parsed.data.type,
        personName: person.name,
        classId: person.classId,
        studentId: person.studentId,
        teacherId: person.teacherId,
        status: parsed.data.status,
        attendanceDate: parsed.data.attendanceDate,
        notes: parsed.data.notes || null,
        isConfirmed: parsed.data.isConfirmed === "on",
        recordedBy: user.id,
      }))).returning({ id: attendanceRecords.id });
      await tx.update(auditLogs).set({ entityId: String(records[0].id) }).where(eq(auditLogs.id, audit.id));
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Catatan ini sudah tersimpan. Tidak ada data ganda yang dibuat." };
    return { error: internalErrorMessage(reportServerError("create-attendance", error)) };
  }
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  revalidatePath("/reports");
  return { success: `${people.length} ${parsed.data.type === "SISWA" ? "siswa" : "guru"} berhasil dicatat sebagai ${parsed.data.status}.` };
}

const studentRosterSchema = z.object({
  classId: z.coerce.number().int().positive(),
  names: z.string().trim().min(2, "Daftar nama siswa masih kosong."),
});

export async function replaceStudentRosterAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const parsed = studentRosterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const names = [...new Set(parsed.data.names.split(/\r?\n/).map((name) => name.trim()).filter(Boolean))];
  if (names.length > 60) return { error: "Maksimal 60 siswa per kelas." };
  await db.transaction(async (tx) => {
    const current = await tx.select({ id: students.id, name: students.name }).from(students).where(and(eq(students.classId, parsed.data.classId), eq(students.isActive, true)));
    const incoming = new Set(names.map((name) => name.toLowerCase()));
    const removedIds = current.filter((item) => !incoming.has(item.name.toLowerCase())).map((item) => item.id);
    for (const id of removedIds) await tx.update(students).set({ status: "PINDAH", isActive: false, updatedAt: new Date() }).where(eq(students.id, id));
    const existingNames = new Set(current.map((item) => item.name.toLowerCase()));
    const newNames = names.filter((name) => !existingNames.has(name.toLowerCase()));
    if (newNames.length) await tx.insert(students).values(newNames.map((name, index) => ({ classId: parsed.data.classId, name, studentNumber: `TMP-${parsed.data.classId}-${Date.now()}-${index + 1}` })));
    await tx.insert(auditLogs).values({ userId: user.id, action: "REPLACE", entity: "STUDENT_ROSTER", entityId: String(parsed.data.classId), description: `Memperbarui daftar ${names.length} siswa dalam satu kelas.` });
  });
  revalidatePath("/students");
  revalidatePath("/attendance");
  return { success: `${names.length} siswa berhasil disimpan.` };
}

export async function deleteAttendanceAction(formData: FormData) {
  const user = await requireUser();
  if (!(["ADMIN", "GURU_PIKET"] as const).includes(user.role as "ADMIN" | "GURU_PIKET")) return;
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return;
  const deleted = await db.delete(attendanceRecords).where(eq(attendanceRecords.id, id.data)).returning({ id: attendanceRecords.id });
  if (!deleted.length) return;
  await db.insert(auditLogs).values({ userId: user.id, action: "DELETE", entity: "ATTENDANCE", entityId: String(id.data), description: `Menghapus catatan ketidakhadiran #${id.data}.` });
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  revalidatePath("/reports");
}

const teacherSchema = z.object({
  name: z.string().trim().min(2).max(120),
  employeeNumber: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(30).optional(),
  subject: z.string().trim().max(80).optional(),
});

export async function createTeacherAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  const parsed = teacherSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const name = normalizeTeacherName(parsed.data.name);
  try {
    await db.transaction(async (tx) => {
      const [audit] = await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "CREATE", entity: "TEACHER", description: `Menambahkan guru ${name}.` }).returning({ id: auditLogs.id });
      const [teacher] = await tx.insert(teachers).values({
        name,
        employeeNumber: parsed.data.employeeNumber || null,
        phone: parsed.data.phone || null,
        subject: parsed.data.subject || null,
      }).returning({ id: teachers.id });
      await tx.update(auditLogs).set({ entityId: String(teacher.id) }).where(eq(auditLogs.id, audit.id));
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Permintaan penambahan guru ini sudah diproses." };
    if (isUniqueViolation(error, "teachers_employee_number_unique")) return { error: "NIP/NUPTK sudah digunakan guru lain." };
    return { error: internalErrorMessage(reportServerError("create-teacher", error)) };
  }
  revalidatePath("/teachers");
  return { success: "Guru berhasil ditambahkan." };
}

const dutyTeacherSchema = z.object({
  teacherId: z.coerce.number().int().positive(),
  username: z.string().trim().toLowerCase().refine((value) => usernamePattern.test(value), "Username harus 3-60 karakter dan hanya boleh berisi huruf kecil, angka, titik, garis bawah, atau tanda hubung."),
});

export async function setDutyTeacherAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  const parsed = dutyTeacherSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [teacher] = await db.select({ id: teachers.id, name: teachers.name, isActive: teachers.isActive }).from(teachers).where(eq(teachers.id, parsed.data.teacherId)).limit(1);
  if (!teacher || !teacher.isActive) return { error: "Guru tidak ditemukan atau sudah tidak aktif." };

  const [account] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.teacherId, teacher.id)).limit(1);
  const [usernameOwner] = await db.select({ id: users.id }).from(users).where(eq(users.username, parsed.data.username)).limit(1);
  if (usernameOwner && usernameOwner.id !== account?.id) return { error: `Username @${parsed.data.username} sudah digunakan akun lain.` };

  let temporaryPassword: string | undefined;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: admin.id, action: "UPDATE", entity: "TEACHER", entityId: String(teacher.id), description: `${teacher.name} ditetapkan sebagai guru piket dengan username @${parsed.data.username}.` });
      await tx.update(teachers).set({ isDutyTeacher: true, updatedAt: new Date() }).where(eq(teachers.id, teacher.id));
      if (account) {
        await tx.update(users).set({ name: teacher.name, username: parsed.data.username, role: "GURU_PIKET", isActive: true, updatedAt: new Date() }).where(eq(users.id, account.id));
      } else {
        temporaryPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(temporaryPassword);
        await tx.insert(users).values({ teacherId: teacher.id, name: teacher.name, username: parsed.data.username, passwordHash, role: "GURU_PIKET", mustChangePassword: true });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { error: "Permintaan yang sama sudah diproses. Muat ulang data guru untuk melihat hasil terbaru." };
    if (!isUniqueViolation(error)) return { error: internalErrorMessage(reportServerError("set-duty-teacher", error)) };
    return { error: "Username gagal disimpan. Pastikan username belum digunakan akun lain." };
  }

  revalidatePath("/teachers");
  revalidatePath(`/teachers/${teacher.id}`);
  revalidatePath("/schedule");
  revalidatePath("/accounts");
  return {
    success: account ? `Username ${teacher.name} berhasil diperbarui.` : `${teacher.name} berhasil ditetapkan sebagai guru piket.`,
    temporaryPassword,
    accountName: teacher.name,
  };
}

export async function removeDutyTeacherAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = z.coerce.number().int().positive().safeParse(formData.get("teacherId"));
  if (!id.success) return { error: "Guru tidak valid." };
  const [teacher] = await db.select({ id: teachers.id, name: teachers.name, isDutyTeacher: teachers.isDutyTeacher }).from(teachers).where(eq(teachers.id, id.data)).limit(1);
  if (!teacher) return { error: "Guru tidak ditemukan." };
  if (!teacher.isDutyTeacher) return { success: `${teacher.name} sudah berstatus guru reguler.` };
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.teacherId, teacher.id)).limit(1);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.update(teachers).set({ isDutyTeacher: false, updatedAt: now }).where(eq(teachers.id, teacher.id));
    await tx.update(dutySchedules).set({ isActive: false, inactiveAt: now }).where(and(eq(dutySchedules.teacherId, teacher.id), eq(dutySchedules.isActive, true)));
    if (account) {
      await tx.update(users).set({ role: "GURU", isActive: false, updatedAt: now }).where(eq(users.id, account.id));
      await tx.delete(sessions).where(eq(sessions.userId, account.id));
    }
    await tx.insert(auditLogs).values({ userId: admin.id, action: "DEACTIVATE", entity: "TEACHER", entityId: String(teacher.id), description: `Melepas status guru piket ${teacher.name}, menonaktifkan akun operasional, dan menutup jadwal aktifnya.` });
  });

  revalidatePath("/teachers");
  revalidatePath(`/teachers/${teacher.id}`);
  revalidatePath("/schedule");
  revalidatePath("/accounts");
  return { success: `${teacher.name} sudah dilepas dari tugas guru piket.` };
}

export async function updateTeacherAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  const parsed = teacherSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success) return { error: parsed.success ? "ID guru tidak valid." : parsed.error.issues[0].message };
  const name = normalizeTeacherName(parsed.data.name);
  await db.update(teachers).set({
    name,
    employeeNumber: parsed.data.employeeNumber || null,
    phone: parsed.data.phone || null,
    subject: parsed.data.subject || null,
    updatedAt: new Date(),
  }).where(eq(teachers.id, id.data));
  await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.teacherId, id.data));
  await db.insert(auditLogs).values({ userId: user.id, action: "UPDATE", entity: "TEACHER", entityId: String(id.data), description: `Memperbarui data guru ${name}.` });
  revalidatePath("/teachers");
  revalidatePath(`/teachers/${id.data}`);
  return { success: "Data guru berhasil diperbarui." };
}

const scheduleSchema = z.object({
  teacherId: z.coerce.number().int().positive(),
  weekday: z.coerce.number().int().min(1).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function createScheduleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const teacher = await db.select({ duty: teachers.isDutyTeacher, name: teachers.name }).from(teachers).where(eq(teachers.id, parsed.data.teacherId)).limit(1);
  if (!teacher[0]?.duty) return { error: "Guru harus ditetapkan sebagai guru piket terlebih dahulu." };
  const duplicate = await db.select({ id: dutySchedules.id }).from(dutySchedules).where(and(eq(dutySchedules.weekday, parsed.data.weekday), eq(dutySchedules.isActive, true))).limit(1);
  if (duplicate[0]) return { error: "Hari tersebut sudah memiliki guru piket." };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "CREATE", entity: "SCHEDULE", description: `Menambahkan jadwal piket untuk ${teacher[0].name}.` });
      await tx.insert(dutySchedules).values({ ...parsed.data, shift: "PAGI", startTime: `${parsed.data.startTime}:00`, endTime: `${parsed.data.endTime}:00` });
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Permintaan jadwal ini sudah diproses." };
    if (isUniqueViolation(error, "duty_schedule_active_day_unique")) return { error: "Hari tersebut sudah memiliki guru piket." };
    return { error: internalErrorMessage(reportServerError("create-schedule", error)) };
  }
  revalidatePath("/schedule");
  return { success: "Jadwal piket berhasil disimpan." };
}

export async function deleteScheduleAction(formData: FormData) {
  const user = await requireAdmin();
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return;
  const updated = await db.update(dutySchedules).set({ isActive: false, inactiveAt: new Date() }).where(and(eq(dutySchedules.id, id.data), eq(dutySchedules.isActive, true))).returning({ id: dutySchedules.id });
  if (!updated.length) return;
  await db.insert(auditLogs).values({ userId: user.id, action: "DEACTIVATE", entity: "SCHEDULE", entityId: String(id.data), description: `Menonaktifkan jadwal piket #${id.data} tanpa menghapus riwayat.` });
  revalidatePath("/schedule");
}

export async function moveScheduleAction(scheduleId: number, weekday: number): Promise<ActionState> {
  const user = await requireAdmin();
  const parsedScheduleId = z.coerce.number().int().positive().safeParse(scheduleId);
  const parsedWeekday = z.coerce.number().int().min(1).max(6).safeParse(weekday);
  if (!parsedScheduleId.success || !parsedWeekday.success) return { error: "Hari jadwal tidak valid." };

  const [schedule] = await db.select({ id: dutySchedules.id, teacherId: dutySchedules.teacherId, weekday: dutySchedules.weekday, shift: dutySchedules.shift, teacher: teachers.name }).from(dutySchedules).innerJoin(teachers, eq(dutySchedules.teacherId, teachers.id)).where(and(eq(dutySchedules.id, parsedScheduleId.data), eq(dutySchedules.isActive, true))).limit(1);
  if (!schedule) return { error: "Jadwal tidak ditemukan atau sudah tidak aktif." };
  if (schedule.weekday === parsedWeekday.data) return { success: "Jadwal sudah berada di hari tersebut." };

  const duplicate = await db.select({ id: dutySchedules.id }).from(dutySchedules).where(and(eq(dutySchedules.weekday, parsedWeekday.data), eq(dutySchedules.isActive, true))).limit(1);
  if (duplicate[0]) return { error: "Hari tujuan sudah memiliki guru piket." };

  try {
    await db.transaction(async (tx) => {
      await tx.update(dutySchedules).set({ weekday: parsedWeekday.data }).where(and(eq(dutySchedules.id, schedule.id), eq(dutySchedules.isActive, true)));
      await tx.insert(auditLogs).values({ userId: user.id, action: "UPDATE", entity: "SCHEDULE", entityId: String(schedule.id), description: `Memindahkan jadwal piket ${schedule.teacher} dari ${weekdayNames[schedule.weekday]} ke ${weekdayNames[parsedWeekday.data]}.` });
    });
  } catch (error) {
    if (isUniqueViolation(error, "duty_schedule_active_day_unique")) return { error: "Hari tujuan sudah memiliki guru piket." };
    return { error: internalErrorMessage(reportServerError("move-schedule", error)) };
  }
  revalidatePath("/schedule");
  return { success: "Jadwal piket berhasil dipindahkan." };
}

export async function updateHomeroomAction(formData: FormData) {
  const user = await requireAdmin();
  const classId = z.coerce.number().int().positive().parse(formData.get("classId"));
  const rawTeacherId = formData.get("teacherId");
  const teacherId = rawTeacherId ? z.coerce.number().int().positive().parse(rawTeacherId) : null;
  await db.update(schoolClasses).set({ homeroomTeacherId: teacherId }).where(eq(schoolClasses.id, classId));
  await db.insert(auditLogs).values({ userId: user.id, action: "UPDATE", entity: "CLASS", entityId: String(classId), description: `Memperbarui wali kelas.` });
  revalidatePath("/classes");
}

export async function importStudentsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Pilih file Excel siswa terlebih dahulu." };
  try {
    const workbook = await loadWorkbook(file);
    const sheet = workbook.getWorksheet("Data Siswa");
    if (!sheet) return { error: "Sheet 'Data Siswa' tidak ditemukan. Gunakan template yang disediakan." };
    const classRows = await db.select({ id: schoolClasses.id, name: schoolClasses.name }).from(schoolClasses);
    const classMap = new Map(classRows.map((item) => [item.name.toUpperCase(), item.id]));
    const parsed: Array<{ studentNumber: string; name: string; classId: number; gender: "L" | "P" | null; parentName: string | null; parentPhone: string | null }> = [];
    const errors: string[] = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      const values = [1, 2, 3, 4, 5, 6].map((column) => String(row.getCell(column).text || "").trim());
      if (!values.some(Boolean)) return;
      const [studentNumber, name, className, gender, parentName, parentPhone] = values;
      const classId = classMap.get(className.toUpperCase());
      if (!studentNumber || !name || !classId) { errors.push(`Baris ${number}: NIS, nama, dan kelas wajib valid.`); return; }
      if (gender && !["L", "P"].includes(gender.toUpperCase())) { errors.push(`Baris ${number}: jenis kelamin harus L atau P.`); return; }
      parsed.push({ studentNumber, name, classId, gender: gender ? gender.toUpperCase() as "L" | "P" : null, parentName: parentName || null, parentPhone: parentPhone || null });
    });
    if (errors.length) return { error: errors.slice(0, 5).join(" ") + (errors.length > 5 ? ` Dan ${errors.length - 5} kesalahan lain.` : "") };
    if (!parsed.length) return { error: "File tidak memiliki baris data siswa." };
    if (new Set(parsed.map((item) => item.studentNumber)).size !== parsed.length) return { error: "Terdapat NIS ganda di dalam file." };
    const [activeYear] = await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
    await db.transaction(async (tx) => {
      for (const item of parsed) {
        const existing = await tx.select({ id: students.id }).from(students).where(eq(students.studentNumber, item.studentNumber)).limit(1);
        let studentId: number;
        if (existing[0]) {
          studentId = existing[0].id;
          await tx.update(students).set({ name: item.name, classId: item.classId, gender: item.gender, parentName: item.parentName, parentPhone: item.parentPhone, status: "AKTIF", isActive: true, updatedAt: new Date() }).where(eq(students.id, studentId));
        } else {
          const [created] = await tx.insert(students).values({ ...item, status: "AKTIF" }).returning({ id: students.id });
          studentId = created.id;
        }
        if (activeYear) await tx.insert(studentEnrollments).values({ studentId, classId: item.classId, academicYearId: activeYear.id, outcome: "AKTIF" }).onConflictDoUpdate({ target: [studentEnrollments.studentId, studentEnrollments.academicYearId], set: { classId: item.classId, outcome: "AKTIF", updatedAt: new Date() } });
      }
      await tx.insert(auditLogs).values({ userId: user.id, action: "IMPORT", entity: "STUDENT", description: `Mengimpor atau memperbarui ${parsed.length} siswa dari Excel.` });
    });
    revalidatePath("/students"); revalidatePath("/attendance");
    return { success: `${parsed.length} data siswa berhasil diimpor atau diperbarui.` };
  } catch (error) {
    const reference = reportServerError("import-students", error);
    return { error: `File siswa gagal diproses. Pastikan memakai template terbaru. Referensi: ${reference}.` };
  }
}

export async function importTeachersAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Pilih file Excel guru terlebih dahulu." };
  try {
    const workbook = await loadWorkbook(file);
    const sheet = workbook.getWorksheet("Data Guru");
    if (!sheet) return { error: "Sheet 'Data Guru' tidak ditemukan. Gunakan template yang disediakan." };
    const parsed: Array<{ employeeNumber: string; name: string; subject: string | null; phone: string | null; isDutyTeacher: boolean; username: string | null }> = [];
    const errors: string[] = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      const values = [1, 2, 3, 4, 5, 6].map((column) => String(row.getCell(column).text || "").trim());
      if (!values.some(Boolean)) return;
      const [employeeNumber, rawName, subject, phone, duty, username] = values;
      const name = normalizeTeacherName(rawName);
      if (!employeeNumber || !name || !["YA", "TIDAK"].includes(duty.toUpperCase())) { errors.push(`Baris ${number}: NIP/NUPTK, nama, dan status guru piket wajib valid.`); return; }
      const isDutyTeacher = duty.toUpperCase() === "YA";
      const accountUsername = isDutyTeacher ? (username.toLowerCase() || usernameFromTeacherName(name)) : null;
      if (accountUsername && !usernamePattern.test(accountUsername)) { errors.push(`Baris ${number}: format username tidak valid.`); return; }
      parsed.push({ employeeNumber, name, subject: subject || null, phone: phone || null, isDutyTeacher, username: accountUsername });
    });
    if (errors.length) return { error: errors.slice(0, 5).join(" ") };
    if (!parsed.length) return { error: "File tidak memiliki baris data guru." };
    if (new Set(parsed.map((item) => item.employeeNumber)).size !== parsed.length) return { error: "Terdapat NIP/NUPTK ganda di dalam file." };
    const importedUsernames = parsed.flatMap((item) => item.username ? [item.username] : []);
    if (new Set(importedUsernames).size !== importedUsernames.length) return { error: "Terdapat username guru piket ganda di dalam file." };
    await db.transaction(async (tx) => {
      for (const item of parsed) {
        const existing = await tx.select({ id: teachers.id }).from(teachers).where(eq(teachers.employeeNumber, item.employeeNumber)).limit(1);
        let teacherId: number;
        if (existing[0]) { teacherId = existing[0].id; await tx.update(teachers).set({ name: item.name, subject: item.subject, phone: item.phone, isDutyTeacher: item.isDutyTeacher, isActive: true, updatedAt: new Date() }).where(eq(teachers.id, teacherId)); }
        else { const [created] = await tx.insert(teachers).values({ employeeNumber: item.employeeNumber, name: item.name, subject: item.subject, phone: item.phone, isDutyTeacher: item.isDutyTeacher }).returning({ id: teachers.id }); teacherId = created.id; }
        const account = await tx.select({ id: users.id }).from(users).where(eq(users.teacherId, teacherId)).limit(1);
        if (item.isDutyTeacher && item.username) {
          const [usernameOwner] = await tx.select({ id: users.id }).from(users).where(eq(users.username, item.username)).limit(1);
          if (usernameOwner && usernameOwner.id !== account[0]?.id) throw new Error(`Username @${item.username} sudah digunakan akun lain.`);
        }
        if (account[0]) {
          await tx.update(users).set({ name: item.name, username: item.username || undefined, role: item.isDutyTeacher ? "GURU_PIKET" : "GURU", isActive: item.isDutyTeacher, updatedAt: new Date() }).where(eq(users.id, account[0].id));
          if (!item.isDutyTeacher) await tx.delete(sessions).where(eq(sessions.userId, account[0].id));
        } else if (item.isDutyTeacher && item.username) {
          await tx.insert(users).values({ teacherId, name: item.name, username: item.username, passwordHash: await hashPassword(generateTemporaryPassword()), role: "GURU_PIKET", mustChangePassword: true });
        }
        if (!item.isDutyTeacher) await tx.update(dutySchedules).set({ isActive: false, inactiveAt: new Date() }).where(and(eq(dutySchedules.teacherId, teacherId), eq(dutySchedules.isActive, true)));
      }
      await tx.insert(auditLogs).values({ userId: user.id, action: "IMPORT", entity: "TEACHER", description: `Mengimpor atau memperbarui ${parsed.length} guru dari Excel.` });
    });
    revalidatePath("/teachers"); revalidatePath("/schedule");
    return { success: `${parsed.length} data guru berhasil diimpor atau diperbarui.` };
  } catch (error) {
    if (isUniqueViolation(error, "users_username_unique")) return { error: "Salah satu username sudah digunakan akun lain." };
    const reference = reportServerError("import-teachers", error);
    return { error: `File guru gagal diproses. Pastikan memakai template terbaru. Referensi: ${reference}.` };
  }
}

export async function promoteAcademicYearAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  const mode = formData.get("mode");
  if (mode !== "ROMBEL_TETAP" && mode !== "ROMBEL_BARU") return { error: "Pilih metode kenaikan kelas terlebih dahulu." };
  const targetName = String(formData.get("targetYear") || "").trim();
  const match = /^(\d{4})\/(\d{4})$/.exec(targetName);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return { error: "Format tahun ajaran harus seperti 2027/2028." };
  if (formData.get("confirmed") !== "on") return { error: "Centang konfirmasi setelah memeriksa penempatan kelas dan mengunduh backup." };
  const [currentYear] = await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  if (!currentYear) return { error: "Tahun ajaran aktif belum tersedia." };
  if (currentYear.name === targetName) return { error: "Tahun ajaran tujuan harus berbeda dari tahun aktif." };
  const classRows = await db.select({ id: schoolClasses.id, name: schoolClasses.name, grade: schoolClasses.grade }).from(schoolClasses).where(eq(schoolClasses.isActive, true));
  const classById = new Map(classRows.map((item) => [item.id, item]));
  const classByName = new Map(classRows.map((item) => [item.name.toUpperCase(), item]));
  const sourceClasses = classRows.filter((item) => item.grade < 9);
  const activeStudents = await db.select({ id: students.id, studentNumber: students.studentNumber, name: students.name, classId: students.classId }).from(students).where(and(eq(students.isActive, true), eq(students.status, "AKTIF")));
  const unplacedStudents = activeStudents.filter((student) => !student.classId || !classById.has(student.classId));
  if (unplacedStudents.length) return { error: `${unplacedStudents.length} siswa aktif belum memiliki kelas, termasuk ${unplacedStudents.slice(0, 3).map((student) => student.name).join(", ")}. Perbaiki data siswa sebelum kenaikan kelas.` };
  const eligibleStudents = activeStudents.filter((student) => student.classId && (classById.get(student.classId)?.grade || 9) < 9);
  const assignments = new Map<number, number>();

  if (mode === "ROMBEL_TETAP") {
    const mappings = new Map<number, number>();
    for (const source of sourceClasses) {
      const targetId = Number(formData.get(`target_${source.id}`));
      const target = classById.get(targetId);
      if (!target || target.grade !== source.grade + 1) return { error: `Kelas tujuan untuk ${source.name} harus berada di tingkat ${source.grade + 1}.` };
      mappings.set(source.id, targetId);
    }
    for (const student of eligibleStudents) assignments.set(student.id, mappings.get(student.classId!)!);
  } else {
    const file = formData.get("placementFile");
    if (!(file instanceof File) || !file.size) return { error: "Pilih file penempatan rombel yang sudah diisi." };
    try {
      const workbook = await loadWorkbook(file);
      const sheet = workbook.getWorksheet("Penempatan Kelas");
      if (!sheet) return { error: "Sheet 'Penempatan Kelas' tidak ditemukan. Gunakan template dari halaman ini." };
      const eligibleById = new Map(eligibleStudents.map((student) => [student.id, student]));
      const seen = new Set<number>();
      const errors: string[] = [];
      sheet.eachRow((row, number) => {
        if (number === 1) return;
        const id = Number(row.getCell(1).value);
        const [studentNumber, name, sourceClassName, targetClassName] = [2, 3, 4, 5].map((column) => String(row.getCell(column).text || "").trim());
        if (!id && !studentNumber && !name && !sourceClassName && !targetClassName) return;
        const student = eligibleById.get(id);
        if (!Number.isInteger(id) || !student) { errors.push(`Baris ${number}: siswa tidak dikenal atau tidak lagi aktif.`); return; }
        if (seen.has(id)) { errors.push(`Baris ${number}: ${student.name} tercantum lebih dari sekali.`); return; }
        seen.add(id);
        const source = student.classId ? classById.get(student.classId) : undefined;
        const target = classByName.get(targetClassName.toUpperCase());
        if ((student.studentNumber || "") !== studentNumber || student.name.trim().toLowerCase() !== name.toLowerCase() || source?.name.toUpperCase() !== sourceClassName.toUpperCase()) {
          errors.push(`Baris ${number}: identitas atau kelas lama ${student.name} telah berubah. Unduh template terbaru.`);
          return;
        }
        if (!target || !source || target.grade !== source.grade + 1) {
          errors.push(`Baris ${number}: kelas baru ${student.name} harus berada di tingkat ${source ? source.grade + 1 : "berikutnya"}.`);
          return;
        }
        assignments.set(id, target.id);
      });
      if (errors.length) return { error: errors.slice(0, 5).join(" ") + (errors.length > 5 ? ` Dan ${errors.length - 5} kesalahan lain.` : "") };
      const missing = eligibleStudents.filter((student) => !seen.has(student.id));
      if (missing.length) return { error: `${missing.length} siswa tidak ada dalam file, termasuk ${missing.slice(0, 3).map((student) => student.name).join(", ")}. Unduh ulang template dan jangan menghapus baris.` };
      const totals = new Map<number, number>();
      for (const targetId of assignments.values()) totals.set(targetId, (totals.get(targetId) || 0) + 1);
      const overloaded = [...totals.entries()].find(([, total]) => total > 60);
      if (overloaded) return { error: `Kelas ${classById.get(overloaded[0])?.name} berisi ${overloaded[1]} siswa. Maksimal 60 siswa per rombel.` };
    } catch (error) {
      const reference = reportServerError("parse-promotion-workbook", error);
      return { error: `File penempatan rombel gagal diproses. Pastikan memakai template terbaru. Referensi: ${reference}.` };
    }
  }
  const existingTarget = await db.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.name, targetName)).limit(1);
  if (existingTarget[0]) {
    const [historyCount] = await db.select({ value: count() }).from(studentEnrollments).where(eq(studentEnrollments.academicYearId, existingTarget[0].id));
    if (historyCount.value > 0) return { error: "Tahun ajaran tujuan sudah memiliki data penempatan siswa." };
  }
  try {
    await db.transaction(async (tx) => {
      const methodLabel = mode === "ROMBEL_TETAP" ? "rombel dipertahankan" : "rombel baru dari Excel";
      const [audit] = await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "PROMOTE", entity: "ACADEMIC_YEAR", description: `Memproses kenaikan kelas ${currentYear.name} ke ${targetName} untuk ${activeStudents.length} siswa dengan ${methodLabel}.` }).returning({ id: auditLogs.id });
      let targetYearId = existingTarget[0]?.id;
      if (targetYearId) await tx.update(academicYears).set({ isActive: true }).where(eq(academicYears.id, targetYearId));
      else { const [created] = await tx.insert(academicYears).values({ name: targetName, startYear: Number(match[1]), endYear: Number(match[2]), isActive: true }).returning({ id: academicYears.id }); targetYearId = created.id; }
      await tx.update(auditLogs).set({ entityId: String(targetYearId) }).where(eq(auditLogs.id, audit.id));
      await tx.update(academicYears).set({ isActive: false }).where(eq(academicYears.id, currentYear.id));
      for (const student of activeStudents) {
        if (!student.classId) continue;
        const source = classById.get(student.classId);
        if (!source) continue;
        if (source.grade === 9) {
          await tx.update(students).set({ classId: null, status: "LULUS", isActive: false, updatedAt: new Date() }).where(eq(students.id, student.id));
          await tx.update(studentEnrollments).set({ outcome: "LULUS", updatedAt: new Date() }).where(and(eq(studentEnrollments.studentId, student.id), eq(studentEnrollments.academicYearId, currentYear.id)));
        } else {
          const targetClassId = assignments.get(student.id);
          if (!targetClassId) throw new Error("Missing validated student placement");
          await tx.update(students).set({ classId: targetClassId, updatedAt: new Date() }).where(eq(students.id, student.id));
          await tx.update(studentEnrollments).set({ outcome: "NAIK", updatedAt: new Date() }).where(and(eq(studentEnrollments.studentId, student.id), eq(studentEnrollments.academicYearId, currentYear.id)));
          await tx.insert(studentEnrollments).values({ studentId: student.id, classId: targetClassId, academicYearId: targetYearId, outcome: "AKTIF" });
        }
      }
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Permintaan kenaikan kelas ini sudah diproses." };
    return { error: internalErrorMessage(reportServerError("promote-academic-year", error)) };
  }
  revalidatePath("/academic-years"); revalidatePath("/students"); revalidatePath("/attendance"); revalidatePath("/dashboard");
  return { success: `Kenaikan kelas selesai dengan ${mode === "ROMBEL_TETAP" ? "rombel yang dipertahankan" : "penempatan rombel baru"}. Tahun ajaran ${targetName} sekarang aktif.` };
}
