import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, dutyCompletions, dutySchedules, schoolClasses, students, teachers, users } from "@/db/schema";
import { dutyWeekdayForDate, excludeNonOperationalCalendarDates, findCalendarEntryForDate, getPublishedCalendarEntries, isNonOperationalCalendarStatus, isOperationalSchoolDate, type SchoolCalendarEntry } from "@/lib/school-calendar";
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
  calendarTitle?: string;
};

export type AttendanceAnalysisRow = {
  date: string;
  type: "SISWA" | "GURU";
  studentId: number | null;
  teacherId: number | null;
  studentNumber: string | null;
  employeeNumber: string | null;
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
  return value === "7" || value === "30" || value === "90" ? Number(value) : 90;
}

export type MonitoringFilters = { className?: string; status?: "SAKIT" | "IZIN" | "ALPA" | "DINAS"; type?: "SISWA" | "GURU" };

export async function getMonitoringData(period = 30, filters: MonitoringFilters = {}) {
  const end = jakartaDate();
  const start = shiftDate(end, -(period - 1));
  const currentTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date());
  const [schedules, completions, rawAttendance, calendarEntries] = await Promise.all([
    db.select({
      id: dutySchedules.id,
      teacherId: dutySchedules.teacherId,
      teacherName: teachers.name,
      shift: dutySchedules.shift,
      weekday: dutySchedules.weekday,
      startTime: dutySchedules.startTime,
      endTime: dutySchedules.endTime,
      createdAt: dutySchedules.createdAt,
      inactiveAt: dutySchedules.inactiveAt,
    }).from(dutySchedules).innerJoin(teachers, eq(dutySchedules.teacherId, teachers.id)),
    db.select({
      scheduleId: dutyCompletions.scheduleId,
      teacherId: dutyCompletions.teacherId,
      dutyDate: dutyCompletions.dutyDate,
      shift: dutyCompletions.shift,
      completedAt: dutyCompletions.completedAt,
    }).from(dutyCompletions).where(and(gte(dutyCompletions.dutyDate, start), lte(dutyCompletions.dutyDate, end))),
    db.select({
      date: attendanceRecords.attendanceDate,
      type: attendanceRecords.type,
      studentId: attendanceRecords.studentId,
      teacherId: attendanceRecords.teacherId,
      studentNumber: students.studentNumber,
      employeeNumber: teachers.employeeNumber,
      name: attendanceRecords.personName,
      className: schoolClasses.name,
      status: attendanceRecords.status,
      notes: attendanceRecords.notes,
      confirmed: attendanceRecords.isConfirmed,
      recorder: users.name,
      recorderTeacherId: users.teacherId,
    }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).leftJoin(students, eq(attendanceRecords.studentId, students.id)).leftJoin(teachers, eq(attendanceRecords.teacherId, teachers.id)).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).where(and(gte(attendanceRecords.attendanceDate, start), lte(attendanceRecords.attendanceDate, end), filters.className ? eq(schoolClasses.name, filters.className) : undefined, filters.status ? eq(attendanceRecords.status, filters.status) : undefined, filters.type ? eq(attendanceRecords.type, filters.type) : undefined)),
    getPublishedCalendarEntries(start, end),
  ]);
  const attendance = excludeNonOperationalCalendarDates(rawAttendance, calendarEntries);

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
    const calendarEntry = findCalendarEntryForDate(date, calendarEntries as SchoolCalendarEntry[]);
    const weekday = dutyWeekdayForDate(date, calendarEntry);
    if (!weekday) continue;
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
        calendarTitle: calendarEntry?.title,
      });
    }
  }

  const occurrenceKeys = new Set(occurrences.map((item) => `${item.teacherId}:${item.date}:${item.shift}`));
  for (const completion of completions) {
    const key = `${completion.teacherId}:${completion.dutyDate}:${completion.shift}`;
    if (occurrenceKeys.has(key)) continue;
    const completionCalendar = findCalendarEntryForDate(completion.dutyDate, calendarEntries as SchoolCalendarEntry[]);
    if (completionCalendar && isNonOperationalCalendarStatus(completionCalendar.status)) continue;
    if (!isOperationalSchoolDate(completion.dutyDate, completionCalendar)) continue;
    const schedule = schedules.find((item) => item.id === completion.scheduleId)
      || schedules.find((item) => item.teacherId === completion.teacherId && item.shift === completion.shift);
    if (!schedule) continue;
    const weekday = dutyWeekdayForDate(completion.dutyDate, completionCalendar);
    if (!weekday) continue;
    occurrences.push({
      date: completion.dutyDate,
      weekday: weekdayNames[weekday] || "Hari sekolah",
      teacherId: completion.teacherId,
      teacherName: schedule.teacherName,
      shift: completion.shift,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      status: "SELESAI",
      completedAt: completion.completedAt,
      attendanceCount: activityMap.get(`${completion.teacherId}:${completion.dutyDate}`) || 0,
      calendarTitle: completionCalendar?.title,
    });
    occurrenceKeys.add(key);
  }

  const completed = occurrences.filter((item) => item.status === "SELESAI").length;
  const overdue = occurrences.filter((item) => item.status === "BELUM").length;
  const inProgress = occurrences.filter((item) => item.status === "BERJALAN").length;
  const totalActivity = attendance.length;
  const teacherKeys = new Map(schedules.map((schedule) => [String(schedule.teacherId), schedule]));
  const teacherSummary = [...teacherKeys.values()].map((schedule) => {
    const items = occurrences.filter((item) => item.teacherId === schedule.teacherId);
    const teacherCompleted = items.filter((item) => item.status === "SELESAI").length;
    const teacherOverdue = items.filter((item) => item.status === "BELUM").length;
    return {
      teacherId: schedule.teacherId,
      teacherName: schedule.teacherName,
      scheduled: items.length,
      completed: teacherCompleted,
      overdue: teacherOverdue,
      inProgress: items.filter((item) => item.status === "BERJALAN").length,
      completionRate: items.length ? Math.round(teacherCompleted / items.length * 100) : 0,
      attendanceCount: items.reduce((total, item) => total + item.attendanceCount, 0),
    };
  }).sort((a, b) => a.completionRate - b.completionRate || b.overdue - a.overdue || a.teacherName.localeCompare(b.teacherName));

  const attendanceByDate = new Map<string, ReturnType<typeof emptyStatusCounts> & { total: number }>();
  const studentAttendanceByDate = new Map<string, ReturnType<typeof emptyStatusCounts> & { total: number }>();
  const teacherAttendanceByDate = new Map<string, ReturnType<typeof emptyStatusCounts> & { total: number }>();
  const classMap = new Map<string, ReturnType<typeof emptyStatusCounts> & { total: number; pending: number }>();
  const statusCounts = emptyStatusCounts();
  const studentStatusCounts = emptyStatusCounts();
  const teacherStatusCounts = emptyStatusCounts();
  let confirmedAttendance = 0;
  for (const item of attendance) {
    statusCounts[item.status] += 1;
    if (item.confirmed) confirmedAttendance += 1;

    const daily = attendanceByDate.get(item.date) || { ...emptyStatusCounts(), total: 0 };
    daily[item.status] += 1;
    daily.total += 1;
    attendanceByDate.set(item.date, daily);

    const scopedByDate = item.type === "SISWA" ? studentAttendanceByDate : teacherAttendanceByDate;
    const scopedDaily = scopedByDate.get(item.date) || { ...emptyStatusCounts(), total: 0 };
    scopedDaily[item.status] += 1;
    scopedDaily.total += 1;
    scopedByDate.set(item.date, scopedDaily);
    if (item.type === "SISWA") studentStatusCounts[item.status] += 1;
    else teacherStatusCounts[item.status] += 1;

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
    const calendarEntry = findCalendarEntryForDate(date, calendarEntries);
    return {
      date,
      calendarTitle: calendarEntry?.title || null,
      nonOperational: !isOperationalSchoolDate(date, calendarEntry),
      scheduled: items.length,
      completed: items.filter((item) => item.status === "SELESAI").length,
      attendanceCount: dailyAttendance.total,
      attendanceStatuses: dailyAttendance,
      studentAttendanceCount: (studentAttendanceByDate.get(date) || { ...emptyStatusCounts(), total: 0 }).total,
      teacherAttendanceCount: (teacherAttendanceByDate.get(date) || { ...emptyStatusCounts(), total: 0 }).total,
      studentAttendanceStatuses: studentAttendanceByDate.get(date) || { ...emptyStatusCounts(), total: 0 },
      teacherAttendanceStatuses: teacherAttendanceByDate.get(date) || { ...emptyStatusCounts(), total: 0 },
    };
  });


  return {
    period,
    start,
    end,
    occurrences: occurrences.sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime)),
    teacherSummary,
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
      studentStatusCounts,
      teacherStatusCounts,
    },
    summary: {
      scheduled: occurrences.length,
      completed,
      overdue,
      inProgress,
      totalActivity,
      completionRate: occurrences.length ? Math.round((completed / occurrences.length) * 100) : 0,
      nonOperationalDays: dates.filter((date) => {
        const entry = findCalendarEntryForDate(date, calendarEntries as SchoolCalendarEntry[]);
        return !isOperationalSchoolDate(date, entry);
      }).length,
    },
    calendarEntries,
  };
}

export type MonitoringData = Awaited<ReturnType<typeof getMonitoringData>>;
