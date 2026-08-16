import { eq } from "drizzle-orm";
import { GraduationCap } from "lucide-react";
import { updateHomeroomAction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/db";
import { schoolClasses, teachers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export default async function ClassesPage() {
  await requireAdmin();
  const [classes, teacherList] = await Promise.all([
    db.select({ id: schoolClasses.id, name: schoolClasses.name, grade: schoolClasses.grade, homeroomTeacherId: schoolClasses.homeroomTeacherId, homeroom: teachers.name }).from(schoolClasses).leftJoin(teachers, eq(schoolClasses.homeroomTeacherId, teachers.id)).orderBy(schoolClasses.grade, schoolClasses.name),
    db.select({ id: teachers.id, name: teachers.name }).from(teachers).where(eq(teachers.isActive, true)).orderBy(teachers.name),
  ]);
  return <><PageHeader title="Data kelas" description="16 rombongan belajar SMP IP YAKIN dan wali kelasnya." /><section className="class-grid">{classes.map((item) => <article className="class-card" key={item.id}><div className="class-card-top"><span className={`grade-mark grade-${item.grade}`}><GraduationCap /></span><span>KELAS {item.grade}</span></div><strong>{item.name}</strong><p>{item.homeroom || "Wali kelas belum ditetapkan"}</p><form action={updateHomeroomAction}><input type="hidden" name="classId" value={item.id} /><select name="teacherId" defaultValue={item.homeroomTeacherId || ""}><option value="">Tanpa wali kelas</option>{teacherList.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select><SubmitButton className="button-secondary small" pendingLabel="Menyimpan...">Simpan</SubmitButton></form></article>)}</section></>;
}
