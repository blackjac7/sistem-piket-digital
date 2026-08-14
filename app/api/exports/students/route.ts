import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schoolClasses, students } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { createStudentExport } from "@/lib/excel";

export async function GET() {
  await requireAdmin();
  const rows = await db.select({ studentNumber: students.studentNumber, name: students.name, className: schoolClasses.name, gender: students.gender, parentName: students.parentName, parentPhone: students.parentPhone, status: students.status }).from(students).leftJoin(schoolClasses, eq(students.classId, schoolClasses.id)).orderBy(schoolClasses.grade, schoolClasses.name, students.name);
  const buffer = await createStudentExport(rows);
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="backup-data-siswa-smp-ip-yakin.xlsx"' } });
}
