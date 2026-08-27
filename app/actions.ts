"use server";

import { and, count, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { academicYears, attendanceRecords, auditLogs, dutyCompletions, dutySchedules, passkeys, schoolCalendar, schoolClasses, sessions, studentEnrollments, students, teachers, users } from "@/db/schema";
import { createSession, deleteSession, destinationForUser, requireAdmin, requireRoles, requireUser } from "@/lib/auth";
import { loadWorkbook } from "@/lib/excel";
import { generateTemporaryPassword, hashPassword, needsPasswordRehash, validateNewPassword, verifyPassword } from "@/lib/password";
import { internalErrorMessage, isExclusionViolation, isUniqueViolation, reportServerError } from "@/lib/server-errors";
import { normalizeTeacherName, usernameFromTeacherName, usernamePattern } from "@/lib/teacher-names";
import { dutyWeekdayForDate, getPublishedCalendarEntry, isNonOperationalCalendarStatus, isOperationalSchoolDate } from "@/lib/school-calendar";
import { weekdayNames } from "@/lib/utils";

export type ActionState = {
  error?: string;
  success?: string;
  temporaryPassword?: string;
  accountName?: string;
  temporaryAccounts?: Array<{ name: string; username: string; password: string }>;
};

const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$lKgye5eVW7udIg3/0ryKVA$dLHO8+hRzTnP9HunQJNYYfC475qWyoZyK4m2icugSbw";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const mutationRequestSchema = z.string().uuid();

function compactName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function personNameKey(value: string) {
  return compactName(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("id-ID");
}

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

const schoolCalendarSchema = z.object({
  startDate: z.string().date("Tanggal mulai tidak valid."),
  endDate: z.string().date("Tanggal selesai tidak valid."),
  status: z.enum(["LIBUR", "TUTUP_DARURAT", "KEGIATAN_KHUSUS", "HARI_PENGGANTI"]),
  title: z.string().trim().min(2, "Nama kalender minimal 2 karakter.").max(160, "Nama kalender terlalu panjang."),
  description: z.string().trim().max(1000, "Keterangan terlalu panjang.").optional(),
  scheduleWeekday: z.union([z.literal(""), z.coerce.number().int().min(1).max(6)]).optional(),
  isPublished: z.enum(["on"]).optional(),
}).superRefine((value, context) => {
  if (value.startDate > value.endDate) context.addIssue({ code: "custom", path: ["endDate"], message: "Tanggal selesai harus sama atau setelah tanggal mulai." });
  if (value.status === "HARI_PENGGANTI" && !value.scheduleWeekday) context.addIssue({ code: "custom", path: ["scheduleWeekday"], message: "Pilih hari jadwal yang akan digunakan untuk hari pengganti." });
  if (value.status !== "HARI_PENGGANTI" && value.scheduleWeekday) context.addIssue({ code: "custom", path: ["scheduleWeekday"], message: "Hari jadwal hanya digunakan untuk status Hari pengganti." });
});

const schoolCalendarIdSchema = z.coerce.number().int().positive();

function revalidateCalendarImpact() {
  for (const path of ["/calendar", "/dashboard", "/attendance", "/monitoring", "/reports"]) revalidatePath(path);
}

export async function createSchoolCalendarAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRoles(["ADMIN", "WAKASEK_KURIKULUM"]);
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  const parsed = schoolCalendarSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    status: formData.get("status"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    scheduleWeekday: formData.get("scheduleWeekday") || "",
    isPublished: formData.get("isPublished") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Data kalender tidak valid." };
  const published = parsed.data.isPublished === "on";
  const overlapping = await db.select({ id: schoolCalendar.id, title: schoolCalendar.title, startDate: schoolCalendar.startDate, endDate: schoolCalendar.endDate }).from(schoolCalendar).where(and(
    eq(schoolCalendar.isActive, true),
    eq(schoolCalendar.isPublished, true),
    lte(schoolCalendar.startDate, parsed.data.endDate),
    gte(schoolCalendar.endDate, parsed.data.startDate),
  )).limit(1);
  if (overlapping[0]) return { error: `Rentang tanggal bertabrakan dengan "${overlapping[0].title}" (${overlapping[0].startDate} sampai ${overlapping[0].endDate}).` };

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx.insert(schoolCalendar).values({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        status: parsed.data.status,
        title: parsed.data.title,
        description: parsed.data.description || null,
        scheduleWeekday: parsed.data.status === "HARI_PENGGANTI" ? Number(parsed.data.scheduleWeekday) : null,
        isPublished: published,
        publishedAt: published ? new Date() : null,
        createdBy: user.id,
      }).returning({ id: schoolCalendar.id });
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "CREATE", entity: "SCHOOL_CALENDAR", entityId: String(created.id), description: `${user.name} menambahkan kalender ${parsed.data.title} untuk ${parsed.data.startDate} sampai ${parsed.data.endDate}${published ? " dan mempublikasikannya" : " sebagai draf"}.` });
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Permintaan kalender ini sudah diproses." };
    if (isExclusionViolation(error, "school_calendar_published_no_overlap")) return { error: "Tanggal tersebut sudah memiliki agenda kalender yang dipublikasikan. Muat ulang halaman sebelum mencoba lagi." };
    return { error: internalErrorMessage(reportServerError("create-school-calendar", error)) };
  }
  revalidateCalendarImpact();
  return { success: published ? "Kalender berhasil disimpan dan dipublikasikan." : "Kalender berhasil disimpan sebagai draf." };
}

export async function publishSchoolCalendarAction(formData: FormData) {
  const user = await requireRoles(["ADMIN", "WAKASEK_KURIKULUM"]);
  const requestId = mutationRequestId(formData);
  const id = schoolCalendarIdSchema.safeParse(formData.get("id"));
  if (!requestId.success || !id.success) return;
  const [entry] = await db.select().from(schoolCalendar).where(and(eq(schoolCalendar.id, id.data), eq(schoolCalendar.isActive, true))).limit(1);
  if (!entry || entry.isPublished) return;
  const overlapping = await db.select({ id: schoolCalendar.id, title: schoolCalendar.title }).from(schoolCalendar).where(and(
    eq(schoolCalendar.isActive, true), eq(schoolCalendar.isPublished, true), ne(schoolCalendar.id, id.data),
    lte(schoolCalendar.startDate, entry.endDate), gte(schoolCalendar.endDate, entry.startDate),
  )).limit(1);
  if (overlapping[0]) return;
  try {
    await db.transaction(async (tx) => {
      await tx.update(schoolCalendar).set({ isPublished: true, publishedAt: new Date(), updatedAt: new Date() }).where(and(eq(schoolCalendar.id, id.data), eq(schoolCalendar.isActive, true), eq(schoolCalendar.isPublished, false)));
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "PUBLISH", entity: "SCHOOL_CALENDAR", entityId: String(id.data), description: `${user.name} mempublikasikan kalender ${entry.title}.` });
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return;
    if (isExclusionViolation(error, "school_calendar_published_no_overlap")) return;
    reportServerError("publish-school-calendar", error);
  }
  revalidateCalendarImpact();
}

export async function archiveSchoolCalendarAction(formData: FormData) {
  const user = await requireRoles(["ADMIN", "WAKASEK_KURIKULUM"]);
  const requestId = mutationRequestId(formData);
  const id = schoolCalendarIdSchema.safeParse(formData.get("id"));
  if (!requestId.success || !id.success) return;
  try {
    await db.transaction(async (tx) => {
      const archived = await tx.update(schoolCalendar).set({ isActive: false, isPublished: false, archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(schoolCalendar.id, id.data), eq(schoolCalendar.isActive, true))).returning({ id: schoolCalendar.id, title: schoolCalendar.title });
      if (!archived.length) return;
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "ARCHIVE", entity: "SCHOOL_CALENDAR", entityId: String(id.data), description: `${user.name} mengarsipkan kalender ${archived[0].title}. Riwayat tetap dipertahankan.` });
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return;
    reportServerError("archive-school-calendar", error);
  }
  revalidateCalendarImpact();
}

export async function completeDutyAction(formData: FormData) {
  const user = await requireRoles(["GURU_PIKET"]);
  if (!user.teacherId) return;
  const requestId = mutationRequestId(formData);
  const scheduleId = z.coerce.number().int().positive().safeParse(formData.get("scheduleId"));
  if (!requestId.success || !scheduleId.success) return;
  const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date());
  const calendarEntry = await getPublishedCalendarEntry(today);
  const weekday = dutyWeekdayForDate(today, calendarEntry);
  if (!weekday) return;
  const [schedule] = await db.select({ id: dutySchedules.id, shift: dutySchedules.shift }).from(dutySchedules).where(and(eq(dutySchedules.id, scheduleId.data), eq(dutySchedules.teacherId, user.teacherId), eq(dutySchedules.weekday, weekday), eq(dutySchedules.isActive, true))).limit(1);
  if (!schedule) return;
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(dutyCompletions).values({ scheduleId: schedule.id, teacherId: user.teacherId!, completedBy: user.id, dutyDate: today, shift: schedule.shift }).onConflictDoNothing().returning({ id: dutyCompletions.id });
    if (!inserted.length) return;
    await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "COMPLETE", entity: "DUTY", entityId: String(schedule.id), description: `${user.name} menandai tugas piket ${today} selesai.` });
  });
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

const attendanceRecordIdSchema = z.coerce.number().int().positive();
const attendanceStatusUpdateSchema = z.object({
  id: attendanceRecordIdSchema,
  status: z.enum(["SAKIT", "IZIN", "ALPA", "DINAS"]),
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
  const calendarEntry = await getPublishedCalendarEntry(parsed.data.attendanceDate);
  if (!isOperationalSchoolDate(parsed.data.attendanceDate, calendarEntry)) return { error: calendarEntry && isNonOperationalCalendarStatus(calendarEntry.status) ? `Tanggal ${parsed.data.attendanceDate} ditetapkan sebagai ${calendarEntry.title}. Pencatatan absensi operasional tidak diperlukan.` : "Tanggal tersebut bukan hari operasional sekolah. Gunakan Kegiatan khusus atau Hari pengganti pada kalender sekolah jika sekolah tetap masuk." };
  if (parsed.data.type === "SISWA" && parsed.data.status === "DINAS") return { error: "Status Dinas hanya dapat digunakan untuk absensi guru." };
  const parsedPersonIds = z.array(z.coerce.number().int().positive()).min(1).max(100).safeParse(formData.getAll("personId"));
  if (!parsedPersonIds.success) return { error: `Pilih 1-100 ${parsed.data.type === "SISWA" ? "siswa" : "guru"} yang valid.` };
  const personIds = [...new Set(parsedPersonIds.data)];
  type AttendancePerson = { id: number; name: string; classId: number | null; studentId: number | null; teacherId: number | null };
  let people: AttendancePerson[];
  if (parsed.data.type === "SISWA") {
    const [activeYear] = await db.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
    if (!activeYear) return { error: "Tahun ajaran aktif belum tersedia. Hubungi Admin IT sebelum mencatat absensi siswa." };
    const rows = await db.select({ id: students.id, name: students.name, classId: students.classId }).from(students)
      .innerJoin(schoolClasses, eq(students.classId, schoolClasses.id))
      .where(and(eq(students.isActive, true), eq(students.status, "AKTIF"), eq(schoolClasses.isActive, true), inArray(students.id, personIds)));
    const enrollments = await db.select({ studentId: studentEnrollments.studentId, classId: studentEnrollments.classId }).from(studentEnrollments)
      .where(and(eq(studentEnrollments.academicYearId, activeYear.id), eq(studentEnrollments.outcome, "AKTIF"), inArray(studentEnrollments.studentId, personIds)));
    const enrollmentByStudent = new Map(enrollments.map((row) => [row.studentId, row.classId]));
    people = rows.filter((row) => enrollmentByStudent.get(row.id) === row.classId).map((row) => ({ id: row.id, name: row.name, classId: row.classId, studentId: row.id, teacherId: null }));
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
    if (isUniqueViolation(error, "attendance_student_date_unique") || isUniqueViolation(error, "attendance_teacher_date_unique")) return { error: "Salah satu nama sudah memiliki catatan absensi pada tanggal tersebut. Perbarui catatan yang ada, jangan membuat duplikat." };
    return { error: internalErrorMessage(reportServerError("create-attendance", error)) };
  }
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  revalidatePath("/monitoring");
  revalidatePath("/reports");
  return { success: `${people.length} ${parsed.data.type === "SISWA" ? "siswa" : "guru"} berhasil dicatat sebagai ${parsed.data.status}.` };
}

function revalidateAttendance() {
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  revalidatePath("/monitoring");
  revalidatePath("/reports");
}

export async function confirmAttendanceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRoles(["ADMIN", "GURU_PIKET"]);
  const requestId = mutationRequestId(formData);
  const id = attendanceRecordIdSchema.safeParse(formData.get("id"));
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  if (!id.success) return { error: "Catatan absensi tidak valid." };

  try {
    const changed = await db.transaction(async (tx) => {
      const updated = await tx.update(attendanceRecords)
        .set({ isConfirmed: true, updatedAt: new Date() })
        .where(and(eq(attendanceRecords.id, id.data), eq(attendanceRecords.isConfirmed, false)))
        .returning({ id: attendanceRecords.id, personName: attendanceRecords.personName });
      if (!updated.length) {
        const [existing] = await tx.select({ isConfirmed: attendanceRecords.isConfirmed }).from(attendanceRecords).where(eq(attendanceRecords.id, id.data)).limit(1);
        return existing?.isConfirmed === true;
      }

      await tx.insert(auditLogs).values({
        requestId: requestId.data,
        userId: user.id,
        action: "CONFIRM",
        entity: "ATTENDANCE",
        entityId: String(id.data),
        description: `${user.name} mengonfirmasi catatan absensi ${updated[0].personName} (#${id.data}).`,
      });
      return true;
    });

    if (!changed) return { error: "Catatan tidak ditemukan atau sudah dikonfirmasi sebelumnya." };
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Catatan absensi ini sudah dikonfirmasi." };
    return { error: internalErrorMessage(reportServerError("confirm-attendance", error)) };
  }

  revalidateAttendance();
  return { success: "Catatan absensi berhasil dikonfirmasi." };
}

export async function confirmAllAttendanceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRoles(["ADMIN", "GURU_PIKET"]);
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };

  try {
    const confirmedCount = await db.transaction(async (tx) => {
      const updated = await tx.update(attendanceRecords)
        .set({ isConfirmed: true, updatedAt: new Date() })
        .where(eq(attendanceRecords.isConfirmed, false))
        .returning({ id: attendanceRecords.id });
      if (!updated.length) return 0;

      await tx.insert(auditLogs).values({
        requestId: requestId.data,
        userId: user.id,
        action: "CONFIRM_ALL",
        entity: "ATTENDANCE",
        description: `${user.name} mengonfirmasi ${updated.length} catatan absensi sekaligus.`,
      });
      return updated.length;
    });

    if (!confirmedCount) {
      revalidateAttendance();
      return { success: "Semua catatan absensi sudah dikonfirmasi." };
    }
    revalidateAttendance();
    return { success: `${confirmedCount} catatan absensi berhasil dikonfirmasi sekaligus.` };
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) {
      revalidateAttendance();
      return { success: "Permintaan konfirmasi semua sudah diproses." };
    }
    return { error: internalErrorMessage(reportServerError("confirm-all-attendance", error)) };
  }
}

export async function updateAttendanceStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRoles(["ADMIN", "GURU_PIKET"]);
  const requestId = mutationRequestId(formData);
  const parsed = attendanceStatusUpdateSchema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Status absensi tidak valid." };

  try {
    const changed = await db.transaction(async (tx) => {
      const [record] = await tx.select({
        id: attendanceRecords.id,
        personName: attendanceRecords.personName,
        status: attendanceRecords.status,
        isConfirmed: attendanceRecords.isConfirmed,
      }).from(attendanceRecords).where(eq(attendanceRecords.id, parsed.data.id)).limit(1);
      if (!record || record.isConfirmed) return false;
      if (record.status !== parsed.data.status) {
        const updated = await tx.update(attendanceRecords)
          .set({ status: parsed.data.status, updatedAt: new Date() })
          .where(and(eq(attendanceRecords.id, parsed.data.id), eq(attendanceRecords.isConfirmed, false)))
          .returning({ id: attendanceRecords.id });
        if (!updated.length) return false;
      }

      await tx.insert(auditLogs).values({
        requestId: requestId.data,
        userId: user.id,
        action: "UPDATE",
        entity: "ATTENDANCE",
        entityId: String(parsed.data.id),
        description: record.status === parsed.data.status
          ? `${user.name} memeriksa ulang status absensi ${record.personName} (#${parsed.data.id}); status tetap ${record.status}.`
          : `${user.name} mengubah status absensi ${record.personName} (#${parsed.data.id}) dari ${record.status} menjadi ${parsed.data.status}.`,
      });
      return true;
    });

    if (!changed) return { error: "Catatan tidak ditemukan atau sudah dikonfirmasi. Status tidak dapat diubah lagi." };
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Perubahan status ini sudah diproses." };
    return { error: internalErrorMessage(reportServerError("update-attendance-status", error)) };
  }

  revalidateAttendance();
  return { success: "Status absensi berhasil diperbarui." };
}

const studentRosterSchema = z.object({
  classId: z.coerce.number().int().positive(),
  names: z.string().trim().min(2, "Daftar nama siswa masih kosong."),
});

export async function replaceStudentRosterAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const parsed = studentRosterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  const names = [...new Map(parsed.data.names.split(/\r?\n/).map((name) => name.trim()).filter(Boolean).map((name) => [personNameKey(name), name])).values()];
  if (!names.length) return { error: "Daftar nama siswa harus berisi minimal satu nama." };
  if (names.length > 60) return { error: "Maksimal 60 siswa per kelas." };
  const [classRow] = await db.select({ id: schoolClasses.id, isActive: schoolClasses.isActive }).from(schoolClasses).where(eq(schoolClasses.id, parsed.data.classId)).limit(1);
  if (!classRow?.isActive) return { error: "Kelas tidak ditemukan atau tidak aktif." };
  const [activeYear] = await db.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  if (!activeYear) return { error: "Tahun ajaran aktif belum tersedia." };
  try {
    await db.transaction(async (tx) => {
      const current = await tx.select({ id: students.id, name: students.name, isActive: students.isActive, status: students.status }).from(students).where(eq(students.classId, parsed.data.classId));
      const incoming = new Set(names.map(personNameKey));
      const removed = current.filter((item) => item.isActive && item.status === "AKTIF" && !incoming.has(personNameKey(item.name)));
      for (const item of removed) {
        await tx.update(students).set({ status: "PINDAH", isActive: false, updatedAt: new Date() }).where(eq(students.id, item.id));
        await tx.update(studentEnrollments).set({ outcome: "PINDAH", updatedAt: new Date() }).where(and(eq(studentEnrollments.studentId, item.id), eq(studentEnrollments.academicYearId, activeYear.id)));
      }
      const currentByName = new Map(current.map((item) => [personNameKey(item.name), item]));
      for (const [index, name] of names.entries()) {
        const existing = currentByName.get(personNameKey(name));
        let studentId: number;
        if (existing) {
          studentId = existing.id;
          await tx.update(students).set({ name, classId: parsed.data.classId, status: "AKTIF", isActive: true, updatedAt: new Date() }).where(eq(students.id, studentId));
        } else {
          const [created] = await tx.insert(students).values({ classId: parsed.data.classId, name, studentNumber: `TMP-${parsed.data.classId}-${Date.now()}-${index + 1}`, status: "AKTIF", isActive: true }).returning({ id: students.id });
          studentId = created.id;
        }
        await tx.insert(studentEnrollments).values({ studentId, classId: parsed.data.classId, academicYearId: activeYear.id, outcome: "AKTIF" }).onConflictDoUpdate({ target: [studentEnrollments.studentId, studentEnrollments.academicYearId], set: { classId: parsed.data.classId, outcome: "AKTIF", updatedAt: new Date() } });
      }
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "REPLACE", entity: "STUDENT_ROSTER", entityId: String(parsed.data.classId), description: `Memperbarui daftar ${names.length} siswa dalam satu kelas.` });
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Perubahan roster ini sudah diproses." };
    if (isUniqueViolation(error, "students_number_unique")) return { error: "Nomor siswa sementara bentrok. Muat ulang halaman lalu coba lagi." };
    return { error: internalErrorMessage(reportServerError("replace-student-roster", error)) };
  }
  revalidatePath("/students");
  revalidatePath("/attendance");
  return { success: `${names.length} siswa berhasil disimpan.` };
}

export async function deleteAttendanceAction(formData: FormData) {
  const user = await requireRoles(["ADMIN", "GURU_PIKET"]);
  const requestId = mutationRequestId(formData);
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!requestId.success || !id.success) return;
  try {
    await db.transaction(async (tx) => {
      const deleted = await tx.delete(attendanceRecords).where(eq(attendanceRecords.id, id.data)).returning({ id: attendanceRecords.id });
      if (!deleted.length) return;
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "DELETE", entity: "ATTENDANCE", entityId: String(id.data), description: `Menghapus catatan ketidakhadiran #${id.data}.` });
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return;
    throw error;
  }
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
  const requestId = mutationRequestId(formData);
  const id = z.coerce.number().int().positive().safeParse(formData.get("teacherId"));
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  if (!id.success) return { error: "Guru tidak valid." };
  const [teacher] = await db.select({ id: teachers.id, name: teachers.name, isDutyTeacher: teachers.isDutyTeacher }).from(teachers).where(eq(teachers.id, id.data)).limit(1);
  if (!teacher) return { error: "Guru tidak ditemukan." };
  if (!teacher.isDutyTeacher) return { success: `${teacher.name} sudah berstatus guru reguler.` };
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.teacherId, teacher.id)).limit(1);
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: admin.id, action: "DEACTIVATE", entity: "TEACHER", entityId: String(teacher.id), description: `Melepas status guru piket ${teacher.name}, menonaktifkan akun operasional, dan menutup jadwal aktifnya.` });
      await tx.update(teachers).set({ isDutyTeacher: false, updatedAt: now }).where(eq(teachers.id, teacher.id));
      await tx.update(dutySchedules).set({ isActive: false, inactiveAt: now }).where(and(eq(dutySchedules.teacherId, teacher.id), eq(dutySchedules.isActive, true)));
      if (account) {
        await tx.update(users).set({ role: "GURU", isActive: false, updatedAt: now }).where(eq(users.id, account.id));
        await tx.delete(sessions).where(eq(sessions.userId, account.id));
      }
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Permintaan pelepasan ini sudah diproses." };
    return { error: internalErrorMessage(reportServerError("remove-duty-teacher", error)) };
  }

  revalidatePath("/teachers");
  revalidatePath(`/teachers/${teacher.id}`);
  revalidatePath("/schedule");
  revalidatePath("/accounts");
  return { success: `${teacher.name} sudah dilepas dari tugas guru piket.` };
}

export async function updateTeacherAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const requestId = mutationRequestId(formData);
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  const parsed = teacherSchema.safeParse(Object.fromEntries(formData));
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  if (!id.success || !parsed.success) return { error: parsed.success ? "ID guru tidak valid." : parsed.error.issues[0].message };
  const name = normalizeTeacherName(parsed.data.name);
  try {
    await db.transaction(async (tx) => {
      const updated = await tx.update(teachers).set({ name, employeeNumber: parsed.data.employeeNumber || null, phone: parsed.data.phone || null, subject: parsed.data.subject || null, updatedAt: new Date() }).where(eq(teachers.id, id.data)).returning({ id: teachers.id });
      if (!updated.length) throw new Error("GURU_NOT_FOUND");
      await tx.update(users).set({ name, updatedAt: new Date() }).where(eq(users.teacherId, id.data));
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "UPDATE", entity: "TEACHER", entityId: String(id.data), description: `Memperbarui data guru ${name}.` });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "GURU_NOT_FOUND") return { error: "Guru tidak ditemukan." };
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Perubahan data guru ini sudah diproses." };
    if (isUniqueViolation(error, "teachers_employee_number_unique")) return { error: "NIP/NUPTK sudah digunakan guru lain." };
    return { error: internalErrorMessage(reportServerError("update-teacher", error)) };
  }
  revalidatePath("/teachers");
  revalidatePath(`/teachers/${id.data}`);
  return { success: "Data guru berhasil diperbarui." };
}

const scheduleSchema = z.object({
  teacherId: z.coerce.number().int().positive(),
  weekday: z.coerce.number().int().min(1).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
}).refine((value) => value.startTime < value.endTime, { message: "Jam selesai harus setelah jam mulai.", path: ["endTime"] });

export async function createScheduleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const teacher = await db.select({ duty: teachers.isDutyTeacher, active: teachers.isActive, name: teachers.name }).from(teachers).where(eq(teachers.id, parsed.data.teacherId)).limit(1);
  if (!teacher[0]?.duty || !teacher[0].active) return { error: "Guru harus aktif dan ditetapkan sebagai guru piket terlebih dahulu." };
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
  const requestId = mutationRequestId(formData);
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!requestId.success || !id.success) return;
  try {
    await db.transaction(async (tx) => {
      const updated = await tx.update(dutySchedules).set({ isActive: false, inactiveAt: new Date() }).where(and(eq(dutySchedules.id, id.data), eq(dutySchedules.isActive, true))).returning({ id: dutySchedules.id });
      if (!updated.length) return;
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "DEACTIVATE", entity: "SCHEDULE", entityId: String(id.data), description: `Menonaktifkan jadwal piket #${id.data} tanpa menghapus riwayat.` });
    });
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return;
    throw error;
  }
  revalidatePath("/schedule");
}

export async function moveScheduleAction(scheduleId: number, weekday: number, rawRequestId: string): Promise<ActionState> {
  const user = await requireAdmin();
  const parsedScheduleId = z.coerce.number().int().positive().safeParse(scheduleId);
  const parsedWeekday = z.coerce.number().int().min(1).max(6).safeParse(weekday);
  const requestId = mutationRequestSchema.safeParse(rawRequestId);
  if (!requestId.success) return { error: "Permintaan perubahan jadwal tidak valid. Muat ulang halaman." };
  if (!parsedScheduleId.success || !parsedWeekday.success) return { error: "Hari jadwal tidak valid." };

  const [schedule] = await db.select({ id: dutySchedules.id, teacherId: dutySchedules.teacherId, weekday: dutySchedules.weekday, shift: dutySchedules.shift, teacher: teachers.name }).from(dutySchedules).innerJoin(teachers, eq(dutySchedules.teacherId, teachers.id)).where(and(eq(dutySchedules.id, parsedScheduleId.data), eq(dutySchedules.isActive, true))).limit(1);
  if (!schedule) return { error: "Jadwal tidak ditemukan atau sudah tidak aktif." };
  if (schedule.weekday === parsedWeekday.data) return { success: "Jadwal sudah berada di hari tersebut." };

  const duplicate = await db.select({ id: dutySchedules.id }).from(dutySchedules).where(and(eq(dutySchedules.weekday, parsedWeekday.data), eq(dutySchedules.isActive, true))).limit(1);
  if (duplicate[0]) return { error: "Hari tujuan sudah memiliki guru piket." };

  try {
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "UPDATE", entity: "SCHEDULE", entityId: String(schedule.id), description: `Memindahkan jadwal piket ${schedule.teacher} dari ${weekdayNames[schedule.weekday]} ke ${weekdayNames[parsedWeekday.data]}.` });
      const updated = await tx.update(dutySchedules).set({ weekday: parsedWeekday.data }).where(and(eq(dutySchedules.id, schedule.id), eq(dutySchedules.isActive, true))).returning({ id: dutySchedules.id });
      if (!updated.length) throw new Error("SCHEDULE_NOT_ACTIVE");
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SCHEDULE_NOT_ACTIVE") return { error: "Jadwal tidak ditemukan atau sudah tidak aktif." };
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Perubahan jadwal ini sudah diproses." };
    if (isUniqueViolation(error, "duty_schedule_active_day_unique")) return { error: "Hari tujuan sudah memiliki guru piket." };
    return { error: internalErrorMessage(reportServerError("move-schedule", error)) };
  }
  revalidatePath("/schedule");
  return { success: "Jadwal piket berhasil dipindahkan." };
}

export async function updateHomeroomAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const requestId = mutationRequestId(formData);
  const classId = z.coerce.number().int().positive().safeParse(formData.get("classId"));
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  if (!classId.success) return { error: "Kelas tidak valid." };
  const rawTeacherId = formData.get("teacherId");
  const teacherId = rawTeacherId ? z.coerce.number().int().positive().safeParse(rawTeacherId) : null;
  if (rawTeacherId && !teacherId?.success) return { error: "Guru wali kelas tidak valid." };
  const nextTeacherId = teacherId ? teacherId.data : null;
  if (nextTeacherId) {
    const [teacher] = await db.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.id, nextTeacherId), eq(teachers.isActive, true))).limit(1);
    if (!teacher) return { error: "Guru wali kelas tidak ditemukan atau sudah tidak aktif." };
  }
  try {
    const changed = await db.transaction(async (tx) => {
      const updated = await tx.update(schoolClasses).set({ homeroomTeacherId: nextTeacherId }).where(and(eq(schoolClasses.id, classId.data), eq(schoolClasses.isActive, true))).returning({ id: schoolClasses.id, name: schoolClasses.name });
      if (!updated.length) return false;
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "UPDATE", entity: "CLASS", entityId: String(classId.data), description: `Memperbarui wali kelas ${updated[0].name}.` });
      return true;
    });
    if (!changed) return { error: "Kelas tidak ditemukan atau sudah tidak aktif." };
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Perubahan wali kelas ini sudah diproses." };
    return { error: internalErrorMessage(reportServerError("update-homeroom", error)) };
  }
  revalidatePath("/classes");
  return { success: "Wali kelas berhasil diperbarui." };
}

export async function importStudentsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Pilih file Excel siswa terlebih dahulu." };
  try {
    const workbook = await loadWorkbook(file);
    const sheet = workbook.getWorksheet("Data Siswa");
    if (!sheet) return { error: "Sheet 'Data Siswa' tidak ditemukan. Gunakan template yang disediakan." };
    const classRows = await db.select({ id: schoolClasses.id, name: schoolClasses.name }).from(schoolClasses).where(eq(schoolClasses.isActive, true));
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
    if (!activeYear) return { error: "Tahun ajaran aktif belum tersedia. Atur tahun ajaran sebelum mengimpor siswa." };
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
        await tx.insert(studentEnrollments).values({ studentId, classId: item.classId, academicYearId: activeYear.id, outcome: "AKTIF" }).onConflictDoUpdate({ target: [studentEnrollments.studentId, studentEnrollments.academicYearId], set: { classId: item.classId, outcome: "AKTIF", updatedAt: new Date() } });
      }
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "IMPORT", entity: "STUDENT", description: `Mengimpor atau memperbarui ${parsed.length} siswa dari Excel.` });
    });
    revalidatePath("/students"); revalidatePath("/attendance");
    return { success: `${parsed.length} data siswa berhasil diimpor atau diperbarui.` };
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Import siswa ini sudah diproses sebelumnya." };
    const reference = reportServerError("import-students", error);
    return { error: `File siswa gagal diproses. Pastikan memakai template terbaru. Referensi: ${reference}.` };
  }
}

export async function importTeachersAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const requestId = mutationRequestId(formData);
  if (!requestId.success) return { error: "Formulir telah kedaluwarsa. Muat ulang halaman lalu coba kembali." };
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
    const temporaryAccounts: Array<{ name: string; username: string; password: string }> = [];
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
          const temporaryPassword = generateTemporaryPassword();
          await tx.insert(users).values({ teacherId, name: item.name, username: item.username, passwordHash: await hashPassword(temporaryPassword), role: "GURU_PIKET", mustChangePassword: true });
          temporaryAccounts.push({ name: item.name, username: item.username, password: temporaryPassword });
        }
        if (!item.isDutyTeacher) await tx.update(dutySchedules).set({ isActive: false, inactiveAt: new Date() }).where(and(eq(dutySchedules.teacherId, teacherId), eq(dutySchedules.isActive, true)));
      }
      await tx.insert(auditLogs).values({ requestId: requestId.data, userId: user.id, action: "IMPORT", entity: "TEACHER", description: `Mengimpor atau memperbarui ${parsed.length} guru dari Excel.` });
    });
    revalidatePath("/teachers"); revalidatePath("/schedule");
    return { success: `${parsed.length} data guru berhasil diimpor atau diperbarui.`, temporaryAccounts: temporaryAccounts.length ? temporaryAccounts : undefined };
  } catch (error) {
    if (isUniqueViolation(error, "audit_logs_request_id_unique")) return { success: "Import guru ini sudah diproses sebelumnya." };
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
      await tx.update(academicYears).set({ isActive: false }).where(eq(academicYears.id, currentYear.id));
      if (targetYearId) await tx.update(academicYears).set({ isActive: true }).where(eq(academicYears.id, targetYearId));
      else { const [created] = await tx.insert(academicYears).values({ name: targetName, startYear: Number(match[1]), endYear: Number(match[2]), isActive: true }).returning({ id: academicYears.id }); targetYearId = created.id; }
      await tx.update(auditLogs).set({ entityId: String(targetYearId) }).where(eq(auditLogs.id, audit.id));
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
