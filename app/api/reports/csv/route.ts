import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, schoolClasses, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "GURU_PIKET") return new Response("Forbidden", { status: 403 });
  const rows = await db.select({ type: attendanceRecords.type, name: attendanceRecords.personName, className: schoolClasses.name, status: attendanceRecords.status, date: attendanceRecords.attendanceDate, notes: attendanceRecords.notes, confirmed: attendanceRecords.isConfirmed, recorder: users.name }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).orderBy(attendanceRecords.attendanceDate);
  const headers = ["Jenis", "Nama", "Kelas/Unit", "Status", "Tanggal", "Keterangan", "Konfirmasi", "Pencatat"];
  const csv = "\uFEFF" + [headers, ...rows.map((row) => [row.type, row.name, row.className || "Guru", row.status, row.date, row.notes, row.confirmed ? "Sudah" : "Belum", row.recorder])].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rekap-smp-ip-yakin.csv"` } });
}
