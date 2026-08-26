import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, schoolClasses, students, teachers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAttendanceReport } from "@/lib/excel";
import { attendanceFilterSummary, filterAttendance, parseAttendanceFilter } from "@/lib/attendance-filters";
import { excludeNonOperationalCalendarDates, getPublishedCalendarEntries } from "@/lib/school-calendar";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "GURU_PIKET") return new Response("Forbidden", { status: 403 });
  const filter = parseAttendanceFilter(new URL(request.url).searchParams);
  const rows = await db.select({
    type: attendanceRecords.type,
    studentId: attendanceRecords.studentId,
    teacherId: attendanceRecords.teacherId,
    studentNumber: students.studentNumber,
    employeeNumber: teachers.employeeNumber,
    name: attendanceRecords.personName,
    className: schoolClasses.name,
    status: attendanceRecords.status,
    date: attendanceRecords.attendanceDate,
    notes: attendanceRecords.notes,
    confirmed: attendanceRecords.isConfirmed,
    recorder: users.name,
  }).from(attendanceRecords)
    .leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id))
    .leftJoin(students, eq(attendanceRecords.studentId, students.id))
    .leftJoin(teachers, eq(attendanceRecords.teacherId, teachers.id))
    .innerJoin(users, eq(attendanceRecords.recordedBy, users.id))
    .orderBy(attendanceRecords.attendanceDate, attendanceRecords.personName);
  const dateRangeRows = filterAttendance(rows, { start: filter.start, end: filter.end });
  const calendarStart = filter.start || dateRangeRows[0]?.date;
  const calendarEnd = filter.end || dateRangeRows[dateRangeRows.length - 1]?.date;
  const calendarEntries = calendarStart && calendarEnd ? await getPublishedCalendarEntries(calendarStart, calendarEnd) : [];
  const filteredRows = filterAttendance(excludeNonOperationalCalendarDates(rows, calendarEntries), filter).map((row) => ({
    type: row.type,
    personId: row.studentId ?? row.teacherId,
    studentNumber: row.studentNumber,
    employeeNumber: row.employeeNumber,
    name: row.name,
    className: row.className,
    status: row.status,
    date: row.date,
    notes: row.notes,
    confirmed: row.confirmed,
    recorder: row.recorder,
  }));
  const buffer = await createAttendanceReport(filteredRows, { filterSummary: attendanceFilterSummary(filter), calendarEntries });
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="rekap-absensi-smp-ip-yakin.xlsx"' } });
}
