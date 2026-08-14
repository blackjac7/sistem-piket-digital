import { db } from "@/db";
import { schoolClasses } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { createStudentTemplate } from "@/lib/excel";

export async function GET() {
  await requireAdmin();
  const classes = await db.select({ name: schoolClasses.name }).from(schoolClasses).orderBy(schoolClasses.grade, schoolClasses.name);
  const buffer = await createStudentTemplate(classes.map((item) => item.name));
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="template-data-siswa-smp-ip-yakin.xlsx"' } });
}
