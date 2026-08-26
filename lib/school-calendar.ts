import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { schoolCalendar, schoolCalendarStatus } from "@/db/schema";

export type SchoolCalendarStatus = (typeof schoolCalendarStatus.enumValues)[number];

export const schoolCalendarStatuses = [
  { value: "LIBUR", label: "Libur sekolah", nonOperational: true },
  { value: "TUTUP_DARURAT", label: "Tutup darurat", nonOperational: true },
  { value: "KEGIATAN_KHUSUS", label: "Kegiatan khusus", nonOperational: false },
  { value: "HARI_PENGGANTI", label: "Hari pengganti", nonOperational: false },
] as const satisfies ReadonlyArray<{ value: SchoolCalendarStatus; label: string; nonOperational: boolean }>;

export type SchoolCalendarEntry = {
  id: number;
  startDate: string;
  endDate: string;
  status: SchoolCalendarStatus;
  title: string;
  description: string | null;
  scheduleWeekday: number | null;
  isPublished: boolean;
  isActive: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const nonOperationalCalendarStatuses = ["LIBUR", "TUTUP_DARURAT"] as const satisfies ReadonlyArray<SchoolCalendarStatus>;

export function calendarStatusMeta(status: SchoolCalendarStatus) {
  return schoolCalendarStatuses.find((item) => item.value === status) || schoolCalendarStatuses[0];
}

export function isNonOperationalCalendarStatus(status: SchoolCalendarStatus) {
  return (nonOperationalCalendarStatuses as readonly string[]).includes(status);
}

export function calendarDateOverlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function actualWeekday(date: string) {
  return new Date(`${date}T12:00:00+07:00`).getUTCDay();
}

/**
 * Resolve the recurring weekday used for a concrete date. A published holiday
 * removes the occurrence; a replacement day can explicitly borrow another
 * weekday's recurring duty assignment.
 */
export function dutyWeekdayForDate(date: string, entry?: Pick<SchoolCalendarEntry, "status" | "scheduleWeekday"> | null) {
  if (entry && isNonOperationalCalendarStatus(entry.status)) return null;
  if (entry?.scheduleWeekday) return entry.scheduleWeekday;
  const weekday = actualWeekday(date);
  return weekday >= 1 && weekday <= 6 ? weekday : null;
}

export function isOperationalSchoolDate(date: string, entry?: Pick<SchoolCalendarEntry, "status"> | null) {
  if (entry) return !isNonOperationalCalendarStatus(entry.status);
  const weekday = actualWeekday(date);
  return weekday >= 1 && weekday <= 6;
}

export async function getPublishedCalendarEntry(date: string) {
  const rows = await db.select({
    id: schoolCalendar.id,
    startDate: schoolCalendar.startDate,
    endDate: schoolCalendar.endDate,
    status: schoolCalendar.status,
    title: schoolCalendar.title,
    description: schoolCalendar.description,
    scheduleWeekday: schoolCalendar.scheduleWeekday,
    isPublished: schoolCalendar.isPublished,
    isActive: schoolCalendar.isActive,
    publishedAt: schoolCalendar.publishedAt,
    createdAt: schoolCalendar.createdAt,
    updatedAt: schoolCalendar.updatedAt,
  }).from(schoolCalendar).where(and(
    eq(schoolCalendar.isActive, true),
    eq(schoolCalendar.isPublished, true),
    lte(schoolCalendar.startDate, date),
    gte(schoolCalendar.endDate, date),
  )).orderBy(asc(schoolCalendar.id)).limit(1);
  return rows[0] || null;
}

export async function getPublishedCalendarEntries(startDate: string, endDate: string) {
  return db.select({
    id: schoolCalendar.id,
    startDate: schoolCalendar.startDate,
    endDate: schoolCalendar.endDate,
    status: schoolCalendar.status,
    title: schoolCalendar.title,
    description: schoolCalendar.description,
    scheduleWeekday: schoolCalendar.scheduleWeekday,
    isPublished: schoolCalendar.isPublished,
    isActive: schoolCalendar.isActive,
    publishedAt: schoolCalendar.publishedAt,
    createdAt: schoolCalendar.createdAt,
    updatedAt: schoolCalendar.updatedAt,
  }).from(schoolCalendar).where(and(
    eq(schoolCalendar.isActive, true),
    eq(schoolCalendar.isPublished, true),
    lte(schoolCalendar.startDate, endDate),
    gte(schoolCalendar.endDate, startDate),
  )).orderBy(asc(schoolCalendar.startDate), asc(schoolCalendar.id));
}

export function findCalendarEntryForDate<T extends Pick<SchoolCalendarEntry, "startDate" | "endDate">>(date: string, entries: T[]) {
  return entries.find((entry) => entry.startDate <= date && entry.endDate >= date) || null;
}

export function excludeNonOperationalCalendarDates<T extends { date: string }>(rows: T[], entries: SchoolCalendarEntry[]) {
  return rows.filter((row) => {
    const entry = findCalendarEntryForDate(row.date, entries);
    return isOperationalSchoolDate(row.date, entry);
  });
}

export function formatCalendarRange(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}
