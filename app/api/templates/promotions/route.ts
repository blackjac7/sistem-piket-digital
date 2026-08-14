import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { academicYears, schoolClasses, students } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { createPromotionTemplate } from "@/lib/excel";

export async function GET() {
  await requireAdmin();
  const [currentYear] = await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  if (!currentYear) return new Response("Tahun ajaran aktif belum tersedia.", { status: 409 });

  const classes = await db.select({ id: schoolClasses.id, name: schoolClasses.name, grade: schoolClasses.grade })
    .from(schoolClasses)
    .where(eq(schoolClasses.isActive, true))
    .orderBy(schoolClasses.grade, schoolClasses.name);
  const classById = new Map(classes.map((item) => [item.id, item]));
  const targetClassesByGrade = new Map<number, string[]>();
  for (const schoolClass of classes) {
    targetClassesByGrade.set(schoolClass.grade, [...(targetClassesByGrade.get(schoolClass.grade) || []), schoolClass.name]);
  }

  const activeStudents = await db.select({
    id: students.id,
    studentNumber: students.studentNumber,
    name: students.name,
    classId: students.classId,
  }).from(students).where(and(eq(students.isActive, true), eq(students.status, "AKTIF"))).orderBy(students.name);

  const rows = activeStudents.flatMap((student) => {
    const currentClass = student.classId ? classById.get(student.classId) : undefined;
    if (!currentClass || currentClass.grade >= 9) return [];
    const targets = classes.filter((item) => item.grade === currentClass.grade + 1);
    const suggested = targets.find((item) => item.name.slice(1) === currentClass.name.slice(1)) || targets[0];
    if (!suggested) return [];
    return [{
      id: student.id,
      studentNumber: student.studentNumber,
      name: student.name,
      currentClass: currentClass.name,
      currentGrade: currentClass.grade,
      suggestedClass: suggested.name,
    }];
  }).sort((a, b) => a.currentGrade - b.currentGrade || a.currentClass.localeCompare(b.currentClass) || a.name.localeCompare(b.name));

  const buffer = await createPromotionTemplate(rows, targetClassesByGrade, currentYear.name);
  return new Response(buffer as BodyInit, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="penempatan-rombel-${currentYear.name.replace("/", "-")}.xlsx"`,
  } });
}
