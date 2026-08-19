import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, schoolClasses, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAttendanceReport } from "@/lib/excel";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "GURU_PIKET") return new Response("Forbidden", { status: 403 });
  const rows = await db.select({ type: attendanceRecords.type, name: attendanceRecords.personName, className: schoolClasses.name, status: attendanceRecords.status, date: attendanceRecords.attendanceDate, notes: attendanceRecords.notes, confirmed: attendanceRecords.isConfirmed, recorder: users.name }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).orderBy(attendanceRecords.attendanceDate, attendanceRecords.personName);
  const buffer = await createAttendanceReport(rows);
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="rekap-absensi-smp-ip-yakin.xlsx"' } });
}
