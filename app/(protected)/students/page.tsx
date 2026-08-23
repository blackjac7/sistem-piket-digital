import { and, eq, sql } from "drizzle-orm";
import { ClipboardPaste } from "lucide-react";
import { importStudentsAction, replaceStudentRosterAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { ExcelImport } from "@/components/excel-import";
import { db } from "@/db";
import { schoolClasses, students } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  await requireAdmin();
  const query = await searchParams;
  const classes = await db.select({ id: schoolClasses.id, name: schoolClasses.name, total: sql<number>`count(${students.id})` }).from(schoolClasses).leftJoin(students, and(eq(schoolClasses.id, students.classId), eq(students.isActive, true), eq(students.status, "AKTIF"))).where(eq(schoolClasses.isActive, true)).groupBy(schoolClasses.id).orderBy(schoolClasses.grade, schoolClasses.name);
  const selectedId = Number(query.class) || classes[0]?.id || 0;
  const selected = classes.find((item) => item.id === selectedId) || classes[0];
  const roster = selected ? await db.select({ name: students.name }).from(students).where(and(eq(students.classId, selected.id), eq(students.isActive, true), eq(students.status, "AKTIF"))).orderBy(students.name) : [];
  return <><PageHeader title="Data siswa" description="Kelola siswa per kelas atau import sekaligus menggunakan Excel." /><ExcelImport title="Import banyak siswa" description="Gunakan template agar kelas dan data siswa terbaca dengan benar." templateHref="/api/templates/students" action={importStudentsAction} /><section className="student-master"><article className="panel class-selector"><div className="panel-header"><div><h2>Pilih kelas</h2><p>Jumlah siswa yang sudah terdaftar</p></div></div><div className="master-class-list">{classes.map((item) => <a href={`/students?class=${item.id}`} className={item.id === selected?.id ? "active" : ""} key={item.id}><strong>{item.name}</strong><span>{item.total} siswa</span></a>)}</div></article><article className="panel"><div className="panel-header"><div><h2><ClipboardPaste /> Daftar siswa {selected?.name}</h2><p>Cara cepat untuk memperbarui nama dalam satu kelas</p></div></div>{selected && <ActionForm action={replaceStudentRosterAction} submitLabel="Simpan daftar siswa" resetOnSuccess={false}><input type="hidden" name="classId" value={selected.id} /><label className="field roster-field"><span>Nama siswa</span><textarea name="names" rows={18} defaultValue={roster.map((item) => item.name).join("\n")} placeholder={"Ahmad Fauzan\nAisyah Putri\nBudi Santoso"} /></label><p className="helper-text">Satu nama per baris. Untuk data lengkap seperti NIS dan kontak wali, gunakan import Excel.</p></ActionForm>}</article></section></>;
}
