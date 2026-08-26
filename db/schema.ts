import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "WAKASEK_KURIKULUM", "GURU_PIKET", "GURU"]);
export const personType = pgEnum("person_type", ["SISWA", "GURU"]);
export const attendanceStatus = pgEnum("attendance_status", ["SAKIT", "IZIN", "ALPA", "DINAS"]);
export const shiftType = pgEnum("shift_type", ["PAGI", "SIANG"]);
export const studentStatus = pgEnum("student_status", ["AKTIF", "LULUS", "PINDAH"]);
export const studentGender = pgEnum("student_gender", ["L", "P"]);
export const enrollmentOutcome = pgEnum("enrollment_outcome", ["AKTIF", "NAIK", "TINGGAL", "LULUS", "PINDAH"]);
export const schoolCalendarStatus = pgEnum("school_calendar_status", ["LIBUR", "TUTUP_DARURAT", "KEGIATAN_KHUSUS", "HARI_PENGGANTI"]);

export const teachers = pgTable("teachers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  employeeNumber: varchar("employee_number", { length: 40 }),
  phone: varchar("phone", { length: 30 }),
  subject: varchar("subject", { length: 80 }),
  isDutyTeacher: boolean("is_duty_teacher").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("teachers_name_idx").on(table.name), uniqueIndex("teachers_employee_number_unique").on(table.employeeNumber)]);

export const schoolClasses = pgTable("school_classes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 10 }).notNull(),
  grade: integer("grade").notNull(),
  homeroomTeacherId: integer("homeroom_teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => [uniqueIndex("school_classes_name_unique").on(table.name)]);

export const academicYears = pgTable("academic_years", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 20 }).notNull(),
  startYear: integer("start_year").notNull(),
  endYear: integer("end_year").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("academic_year_name_unique").on(table.name),
  uniqueIndex("academic_year_active_unique").on(table.isActive).where(sql`${table.isActive} = true`),
]);

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => schoolClasses.id, { onDelete: "set null" }),
  name: varchar("name", { length: 120 }).notNull(),
  studentNumber: varchar("student_number", { length: 40 }),
  gender: studentGender("gender"),
  parentName: varchar("parent_name", { length: 120 }),
  parentPhone: varchar("parent_phone", { length: 30 }),
  status: studentStatus("status").notNull().default("AKTIF"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("students_class_idx").on(table.classId), uniqueIndex("students_number_unique").on(table.studentNumber)]);

export const studentEnrollments = pgTable("student_enrollments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => schoolClasses.id, { onDelete: "restrict" }),
  academicYearId: integer("academic_year_id").notNull().references(() => academicYears.id, { onDelete: "restrict" }),
  outcome: enrollmentOutcome("outcome").notNull().default("AKTIF"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("student_enrollment_year_unique").on(table.studentId, table.academicYearId),
  index("student_enrollment_class_idx").on(table.classId),
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  name: varchar("name", { length: 120 }).notNull(),
  username: varchar("username", { length: 60 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("GURU"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  passkeyPromptedAt: timestamp("passkey_prompted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("users_username_unique").on(table.username),
  uniqueIndex("users_teacher_unique").on(table.teacherId).where(sql`${table.teacherId} IS NOT NULL`),
]);

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("sessions_token_unique").on(table.tokenHash), index("sessions_user_idx").on(table.userId)]);

export const passkeys = pgTable("passkeys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  deviceType: varchar("device_type", { length: 40 }).notNull(),
  backedUp: boolean("backed_up").notNull().default(false),
  transports: text("transports"),
  name: varchar("name", { length: 100 }).notNull().default("Passkey perangkat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (table) => [uniqueIndex("passkeys_credential_unique").on(table.credentialId), index("passkeys_user_idx").on(table.userId)]);

export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: serial("id").primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  challenge: text("challenge").notNull(),
  flow: varchar("flow", { length: 20 }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("webauthn_challenges_token_unique").on(table.tokenHash),
  index("webauthn_challenges_expiry_idx").on(table.expiresAt),
]);

export const dutySchedules = pgTable("duty_schedules", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  shift: shiftType("shift").notNull().default("PAGI"),
  startTime: time("start_time").notNull().default("06:30:00"),
  endTime: time("end_time").notNull().default("14:00:00"),
  isActive: boolean("is_active").notNull().default(true),
  inactiveAt: timestamp("inactive_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("duty_schedule_active_unique").on(table.teacherId, table.weekday, table.shift).where(sql`${table.isActive} = true`),
  uniqueIndex("duty_schedule_active_day_unique").on(table.weekday).where(sql`${table.isActive} = true`),
  index("duty_schedule_lookup_idx").on(table.teacherId, table.weekday, table.shift),
]);

/**
 * Published operational exceptions layered on top of the recurring duty
 * schedule. The recurring schedule is intentionally never deleted when a
 * calendar exception is added.
 */
export const schoolCalendar = pgTable("school_calendar", {
  id: serial("id").primaryKey(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: schoolCalendarStatus("status").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description"),
  /** For a replacement day, optionally use another recurring weekday's duty. */
  scheduleWeekday: integer("schedule_weekday"),
  isPublished: boolean("is_published").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("school_calendar_date_order_check", sql`${table.startDate} <= ${table.endDate}`),
  check("school_calendar_weekday_check", sql`${table.scheduleWeekday} IS NULL OR (${table.scheduleWeekday} BETWEEN 1 AND 6)`),
  check("school_calendar_replacement_weekday_check", sql`(${table.status} = 'HARI_PENGGANTI' AND ${table.scheduleWeekday} IS NOT NULL) OR (${table.status} <> 'HARI_PENGGANTI' AND ${table.scheduleWeekday} IS NULL)`),
  index("school_calendar_date_idx").on(table.startDate, table.endDate),
  index("school_calendar_active_idx").on(table.isActive, table.isPublished, table.startDate),
]);

export const dutyCompletions = pgTable("duty_completions", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").references(() => dutySchedules.id, { onDelete: "set null" }),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id, { onDelete: "restrict" }),
  completedBy: integer("completed_by").references(() => users.id, { onDelete: "set null" }),
  dutyDate: date("duty_date").notNull(),
  shift: shiftType("shift").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("duty_completion_unique").on(table.teacherId, table.dutyDate, table.shift),
  index("duty_completion_date_idx").on(table.dutyDate),
]);

export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  type: personType("type").notNull(),
  personName: varchar("person_name", { length: 120 }).notNull(),
  studentId: integer("student_id").references(() => students.id, { onDelete: "set null" }),
  classId: integer("class_id").references(() => schoolClasses.id, { onDelete: "set null" }),
  teacherId: integer("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  status: attendanceStatus("status").notNull(),
  attendanceDate: date("attendance_date").notNull(),
  notes: text("notes"),
  isConfirmed: boolean("is_confirmed").notNull().default(false),
  recordedBy: integer("recorded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("attendance_student_date_unique").on(table.studentId, table.attendanceDate).where(sql`${table.type} = 'SISWA' AND ${table.studentId} IS NOT NULL`),
  uniqueIndex("attendance_teacher_date_unique").on(table.teacherId, table.attendanceDate).where(sql`${table.type} = 'GURU' AND ${table.teacherId} IS NOT NULL`),
  index("attendance_date_idx").on(table.attendanceDate),
  index("attendance_type_idx").on(table.type),
  index("attendance_class_idx").on(table.classId),
]);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  requestId: varchar("request_id", { length: 36 }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 80 }).notNull(),
  entityId: varchar("entity_id", { length: 40 }),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("audit_logs_request_id_unique").on(table.requestId),
  index("audit_created_idx").on(table.createdAt),
]);
