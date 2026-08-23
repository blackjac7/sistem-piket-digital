import { eq } from "drizzle-orm";
import { GraduationCap } from "lucide-react";
import { HomeroomForm } from "@/components/homeroom-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { schoolClasses, teachers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export default async function ClassesPage() {
  await requireAdmin();
  const [classes, teacherList] = await Promise.all([
    db.select({ id: schoolClasses.id, name: schoolClasses.name, grade: schoolClasses.grade, homeroomTeacherId: schoolClasses.homeroomTeacherId, homeroom: teachers.name }).from(schoolClasses).leftJoin(teachers, eq(schoolClasses.homeroomTeacherId, teachers.id)).orderBy(schoolClasses.grade, schoolClasses.name),
    db.select({ id: teachers.id, name: teachers.name }).from(teachers).where(eq(teachers.isActive, true)).orderBy(teachers.name),
  ]);
  return <><PageHeader title="Data kelas" description="16 rombongan belajar SMP IP YAKIN dan wali kelasnya." /><section className="class-grid">{classes.map((item) => <article className="class-card" key={item.id}><div className="class-card-top"><span className={`grade-mark grade-${item.grade}`}><GraduationCap /></span><span>KELAS {item.grade}</span></div><strong>{item.name}</strong><p>{item.homeroom || "Wali kelas belum ditetapkan"}</p><HomeroomForm classId={item.id} teacherId={item.homeroomTeacherId} teachers={teacherList} /></article>)}</section></>;
}
