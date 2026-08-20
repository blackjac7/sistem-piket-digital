import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, schoolClasses, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAttendanceReport } from "@/lib/excel";
import { filterAttendance, parseAttendanceFilter } from "@/lib/attendance-filters";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "GURU_PIKET") return new Response("Forbidden", { status: 403 });
  const rows = await db.select({ type: attendanceRecords.type, name: attendanceRecords.personName, className: schoolClasses.name, status: attendanceRecords.status, date: attendanceRecords.attendanceDate, notes: attendanceRecords.notes, confirmed: attendanceRecords.isConfirmed, recorder: users.name }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).orderBy(attendanceRecords.attendanceDate, attendanceRecords.personName);
  const filteredRows = filterAttendance(rows, parseAttendanceFilter(new URL(request.url).searchParams));
  const buffer = await createAttendanceReport(filteredRows);
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="rekap-absensi-smp-ip-yakin.xlsx"' } });
}
