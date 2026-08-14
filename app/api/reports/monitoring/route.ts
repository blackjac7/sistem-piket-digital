import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, schoolClasses, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createMonitoringReport } from "@/lib/excel";
import { getMonitoringData, normalizeMonitoringPeriod } from "@/lib/monitoring";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "WAKASEK_KURIKULUM") return new Response("Forbidden", { status: 403 });
  const period = normalizeMonitoringPeriod(new URL(request.url).searchParams.get("period") || undefined);
  const data = await getMonitoringData(period);
  const attendance = await db.select({
    date: attendanceRecords.attendanceDate,
    type: attendanceRecords.type,
    name: attendanceRecords.personName,
    className: schoolClasses.name,
    status: attendanceRecords.status,
    notes: attendanceRecords.notes,
    recorder: users.name,
  }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).where(and(gte(attendanceRecords.attendanceDate, data.start), lte(attendanceRecords.attendanceDate, data.end))).orderBy(attendanceRecords.attendanceDate);
  const buffer = await createMonitoringReport(data, attendance);
  return new Response(buffer as BodyInit, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="laporan-piket-${data.start}-${data.end}.xlsx"`,
  } });
}
