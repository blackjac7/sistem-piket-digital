import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, dutyCompletions, dutySchedules, teachers, users } from "@/db/schema";
import { jakartaDate, weekdayNames } from "@/lib/utils";

export type MonitoringStatus = "SELESAI" | "BERJALAN" | "BELUM";

export type DutyOccurrence = {
  date: string;
  weekday: string;
  teacherId: number;
  teacherName: string;
  shift: "PAGI" | "SIANG";
  startTime: string;
  endTime: string;
  status: MonitoringStatus;
  completedAt: Date | null;
  attendanceCount: number;
};

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(start: string, end: string) {
  const dates: string[] = [];
  for (let value = start; value <= end; value = shiftDate(value, 1)) dates.push(value);
  return dates;
}

export function normalizeMonitoringPeriod(value?: string) {
  return value === "7" || value === "90" ? Number(value) : 30;
}

export async function getMonitoringData(period = 30) {
  const end = jakartaDate();
  const start = shiftDate(end, -(period - 1));
  const currentTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date());
  const [schedules, completions, activities] = await Promise.all([
    db.select({
      id: dutySchedules.id,
      teacherId: dutySchedules.teacherId,
      teacherName: teachers.name,
      weekday: dutySchedules.weekday,
      shift: dutySchedules.shift,
      startTime: dutySchedules.startTime,
      endTime: dutySchedules.endTime,
      createdAt: dutySchedules.createdAt,
      inactiveAt: dutySchedules.inactiveAt,
    }).from(dutySchedules).innerJoin(teachers, eq(dutySchedules.teacherId, teachers.id)),
    db.select({
      teacherId: dutyCompletions.teacherId,
      dutyDate: dutyCompletions.dutyDate,
      shift: dutyCompletions.shift,
      completedAt: dutyCompletions.completedAt,
    }).from(dutyCompletions).where(and(gte(dutyCompletions.dutyDate, start), lte(dutyCompletions.dutyDate, end))),
    db.select({
      teacherId: users.teacherId,
      date: attendanceRecords.attendanceDate,
      id: attendanceRecords.id,
    }).from(attendanceRecords).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).where(and(gte(attendanceRecords.attendanceDate, start), lte(attendanceRecords.attendanceDate, end))),
  ]);

  const completionMap = new Map(completions.map((item) => [`${item.teacherId}:${item.dutyDate}:${item.shift}`, item.completedAt]));
  const activityMap = new Map<string, number>();
  for (const item of activities) {
    if (!item.teacherId) continue;
    const key = `${item.teacherId}:${item.date}`;
    activityMap.set(key, (activityMap.get(key) || 0) + 1);
  }

  const occurrences: DutyOccurrence[] = [];
  const dates = enumerateDates(start, end);
  for (const date of dates) {
    const weekday = new Date(`${date}T12:00:00+07:00`).getUTCDay();
    for (const schedule of schedules.filter((item) => {
      const activeFrom = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" }).format(item.createdAt);
      const inactiveOn = item.inactiveAt ? new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" }).format(item.inactiveAt) : null;
      return item.weekday === weekday && date >= activeFrom && (!inactiveOn || date < inactiveOn);
    })) {
      const completedAt = completionMap.get(`${schedule.teacherId}:${date}:${schedule.shift}`) || null;
      occurrences.push({
        date,
        weekday: weekdayNames[weekday] || "Hari sekolah",
        teacherId: schedule.teacherId,
        teacherName: schedule.teacherName,
        shift: schedule.shift,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        status: completedAt ? "SELESAI" : date === end && currentTime <= schedule.endTime.slice(0, 5) ? "BERJALAN" : "BELUM",
        completedAt,
        attendanceCount: activityMap.get(`${schedule.teacherId}:${date}`) || 0,
      });
    }
  }

  const completed = occurrences.filter((item) => item.status === "SELESAI").length;
  const overdue = occurrences.filter((item) => item.status === "BELUM").length;
  const inProgress = occurrences.filter((item) => item.status === "BERJALAN").length;
  const totalActivity = [...activityMap.values()].reduce((total, value) => total + value, 0);
  const teacherKeys = new Map(schedules.map((schedule) => [`${schedule.teacherId}:${schedule.shift}`, schedule]));
  const teacherSummary = [...teacherKeys.values()].map((schedule) => {
    const items = occurrences.filter((item) => item.teacherId === schedule.teacherId && item.shift === schedule.shift);
    return {
      teacherId: schedule.teacherId,
      teacherName: schedule.teacherName,
      shift: schedule.shift,
      scheduled: items.length,
      completed: items.filter((item) => item.status === "SELESAI").length,
      attendanceCount: items.reduce((total, item) => total + item.attendanceCount, 0),
    };
  });
  const trend = dates.slice(-14).map((date) => {
    const items = occurrences.filter((item) => item.date === date);
    return {
      date,
      scheduled: items.length,
      completed: items.filter((item) => item.status === "SELESAI").length,
      attendanceCount: items.reduce((total, item) => total + item.attendanceCount, 0),
    };
  });

  return {
    period,
    start,
    end,
    occurrences: occurrences.sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime)),
    teacherSummary,
    trend,
    summary: {
      scheduled: occurrences.length,
      completed,
      overdue,
      inProgress,
      totalActivity,
      completionRate: occurrences.length ? Math.round((completed / occurrences.length) * 100) : 0,
    },
  };
}
