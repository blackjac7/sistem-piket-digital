import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, dutyCompletions, dutySchedules, schoolClasses, teachers, users } from "@/db/schema";
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

export type AttendanceAnalysisRow = {
  date: string;
  type: "SISWA" | "GURU";
  name: string;
  className: string | null;
  status: "SAKIT" | "IZIN" | "ALPA" | "DINAS";
  notes: string | null;
  confirmed: boolean;
  recorder: string;
  recorderTeacherId: number | null;
};

const emptyStatusCounts = () => ({ SAKIT: 0, IZIN: 0, ALPA: 0, DINAS: 0 });

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
  const [schedules, completions, attendance] = await Promise.all([
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
      date: attendanceRecords.attendanceDate,
      type: attendanceRecords.type,
      name: attendanceRecords.personName,
      className: schoolClasses.name,
      status: attendanceRecords.status,
      notes: attendanceRecords.notes,
      confirmed: attendanceRecords.isConfirmed,
      recorder: users.name,
      recorderTeacherId: users.teacherId,
    }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).where(and(gte(attendanceRecords.attendanceDate, start), lte(attendanceRecords.attendanceDate, end))),
  ]);

  const completionMap = new Map(completions.map((item) => [`${item.teacherId}:${item.dutyDate}:${item.shift}`, item.completedAt]));
  const activityMap = new Map<string, number>();
  for (const item of attendance) {
    if (!item.recorderTeacherId) continue;
    const key = `${item.recorderTeacherId}:${item.date}`;
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
  const totalActivity = attendance.length;
  const teacherKeys = new Map(schedules.map((schedule) => [`${schedule.teacherId}:${schedule.shift}`, schedule]));
  const teacherSummary = [...teacherKeys.values()].map((schedule) => {
    const items = occurrences.filter((item) => item.teacherId === schedule.teacherId && item.shift === schedule.shift);
    const teacherCompleted = items.filter((item) => item.status === "SELESAI").length;
    const teacherOverdue = items.filter((item) => item.status === "BELUM").length;
    return {
      teacherId: schedule.teacherId,
      teacherName: schedule.teacherName,
      shift: schedule.shift,
      scheduled: items.length,
      completed: teacherCompleted,
      overdue: teacherOverdue,
      inProgress: items.filter((item) => item.status === "BERJALAN").length,
      completionRate: items.length ? Math.round(teacherCompleted / items.length * 100) : 0,
      attendanceCount: items.reduce((total, item) => total + item.attendanceCount, 0),
    };
  }).sort((a, b) => a.completionRate - b.completionRate || b.overdue - a.overdue || a.teacherName.localeCompare(b.teacherName));

  const attendanceByDate = new Map<string, ReturnType<typeof emptyStatusCounts> & { total: number }>();
  const classMap = new Map<string, ReturnType<typeof emptyStatusCounts> & { total: number; pending: number }>();
  const statusCounts = emptyStatusCounts();
  let confirmedAttendance = 0;
  for (const item of attendance) {
    statusCounts[item.status] += 1;
    if (item.confirmed) confirmedAttendance += 1;

    const daily = attendanceByDate.get(item.date) || { ...emptyStatusCounts(), total: 0 };
    daily[item.status] += 1;
    daily.total += 1;
    attendanceByDate.set(item.date, daily);

    if (item.type === "SISWA") {
      const className = item.className || "Tanpa kelas";
      const classItem = classMap.get(className) || { ...emptyStatusCounts(), total: 0, pending: 0 };
      classItem[item.status] += 1;
      classItem.total += 1;
      if (!item.confirmed) classItem.pending += 1;
      classMap.set(className, classItem);
    }
  }

  const classSummary = [...classMap.entries()].map(([className, item]) => ({ className, ...item })).sort((a, b) => b.total - a.total || b.ALPA - a.ALPA || a.className.localeCompare(b.className));
  const trend = dates.slice(-14).map((date) => {
    const items = occurrences.filter((item) => item.date === date);
    const dailyAttendance = attendanceByDate.get(date) || { ...emptyStatusCounts(), total: 0 };
    return {
      date,
      scheduled: items.length,
      completed: items.filter((item) => item.status === "SELESAI").length,
      attendanceCount: dailyAttendance.total,
      attendanceStatuses: dailyAttendance,
    };
  });

  const shiftSummary = (["PAGI", "SIANG"] as const).map((shift) => {
    const items = occurrences.filter((item) => item.shift === shift);
    const shiftCompleted = items.filter((item) => item.status === "SELESAI").length;
    return {
      shift,
      scheduled: items.length,
      completed: shiftCompleted,
      overdue: items.filter((item) => item.status === "BELUM").length,
      inProgress: items.filter((item) => item.status === "BERJALAN").length,
      completionRate: items.length ? Math.round(shiftCompleted / items.length * 100) : 0,
      attendanceCount: items.reduce((total, item) => total + item.attendanceCount, 0),
    };
  });

  return {
    period,
    start,
    end,
    occurrences: occurrences.sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime)),
    teacherSummary,
    shiftSummary,
    classSummary,
    trend,
    attendance,
    attendanceSummary: {
      total: attendance.length,
      students: attendance.filter((item) => item.type === "SISWA").length,
      teachers: attendance.filter((item) => item.type === "GURU").length,
      confirmed: confirmedAttendance,
      pending: attendance.length - confirmedAttendance,
      statusCounts,
    },
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

export type MonitoringData = Awaited<ReturnType<typeof getMonitoringData>>;
