import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, UserRoundPen } from "lucide-react";
import { notFound } from "next/navigation";
import { updateTeacherAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { db } from "@/db";
import { teachers, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export default async function EditTeacherPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const teacherId = Number(id);
  if (!Number.isInteger(teacherId)) notFound();
  const [teacher] = await db.select({ id: teachers.id, name: teachers.name, employeeNumber: teachers.employeeNumber, phone: teachers.phone, subject: teachers.subject, isDutyTeacher: teachers.isDutyTeacher, username: users.username }).from(teachers).leftJoin(users, eq(teachers.id, users.teacherId)).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher) notFound();
  return <><PageHeader title="Edit data guru" description="Ganti data placeholder dengan identitas guru sebenarnya." action={<Link href="/teachers" className="button button-secondary"><ArrowLeft /> Kembali</Link>} /><section className="edit-layout"><article className="panel form-panel"><div className="panel-header"><div><h2><UserRoundPen /> Identitas guru</h2><p>Perubahan nama juga diterapkan ke akun login</p></div></div><ActionForm action={updateTeacherAction} submitLabel="Simpan perubahan" resetOnSuccess={false}><input type="hidden" name="id" value={teacher.id} /><label className="field"><span>Nama lengkap</span><input name="name" defaultValue={teacher.name} required /></label><label className="field"><span>NIP/NUPTK</span><input name="employeeNumber" defaultValue={teacher.employeeNumber || ""} /></label><div className="form-grid two"><label className="field"><span>Mata pelajaran</span><input name="subject" defaultValue={teacher.subject || ""} /></label><label className="field"><span>Nomor telepon</span><input name="phone" defaultValue={teacher.phone || ""} /></label></div></ActionForm></article><article className="panel teacher-summary"><span className="avatar large">{teacher.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><h2>{teacher.name}</h2><p>{teacher.subject || "Mata pelajaran belum diatur"}</p>{teacher.isDutyTeacher ? <StatusPill tone="success">Guru piket aktif</StatusPill> : <StatusPill>Guru reguler</StatusPill>}<dl><div><dt>Username</dt><dd className="mono">{teacher.username || "Belum memiliki akun"}</dd></div><div><dt>Kata sandi awal</dt><dd className="mono">{teacher.username ? "SMPYakin#2026" : "—"}</dd></div></dl></article></section></>;
}
