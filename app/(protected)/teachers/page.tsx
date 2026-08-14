import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { BadgeCheck, Pencil, UserPlus } from "lucide-react";
import { createTeacherAction, importTeachersAction, toggleDutyTeacherAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { ExcelImport } from "@/components/excel-import";
import { StatusPill } from "@/components/status-pill";
import { db } from "@/db";
import { teachers, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export default async function TeachersPage() {
  await requireAdmin();
  const list = await db.select({ id: teachers.id, name: teachers.name, employeeNumber: teachers.employeeNumber, phone: teachers.phone, subject: teachers.subject, isDutyTeacher: teachers.isDutyTeacher, isActive: teachers.isActive, username: users.username }).from(teachers).leftJoin(users, eq(teachers.id, users.teacherId)).orderBy(desc(teachers.isDutyTeacher), teachers.name);
  const dutyCount = list.filter((item) => item.isDutyTeacher).length;
  return <>
    <PageHeader title="Data guru" description={`${list.length} guru terdaftar · ${dutyCount} ditetapkan sebagai guru piket`} />
    <ExcelImport title="Import banyak guru" description="Tambah atau perbarui data guru berdasarkan NIP/NUPTK." templateHref="/api/templates/teachers" action={importTeachersAction} />
    <section className="split-layout compact-form">
      <article className="panel form-panel"><div className="panel-header"><div><h2><UserPlus /> Tambah guru</h2><p>Lengkapi data pokok guru</p></div></div><ActionForm action={createTeacherAction} submitLabel="Tambahkan guru">
        <label className="field"><span>Nama lengkap</span><input name="name" required /></label><label className="field"><span>NIP/NUPTK</span><input name="employeeNumber" /></label><div className="form-grid two"><label className="field"><span>Mata pelajaran</span><input name="subject" /></label><label className="field"><span>Nomor telepon</span><input name="phone" /></label></div><label className="checkbox-field"><input name="isDutyTeacher" type="checkbox" /><span><strong>Jadikan guru piket</strong><small>Guru mendapat akses operasional piket.</small></span></label>
      </ActionForm></article>
      <article className="panel data-panel"><div className="panel-header"><div><h2>Daftar 22 guru</h2><p>Edit identitas dan ubah penetapan guru piket</p></div></div><div className="table-scroll"><table><thead><tr><th>Guru</th><th>Nomor induk</th><th>Bidang</th><th>Akun</th><th>Peran</th><th>Aksi</th></tr></thead><tbody>{list.map((item, index) => <tr key={item.id}><td><span className="person-cell"><span className="avatar">{item.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{item.name}</strong><small>Guru #{String(index + 1).padStart(2, "0")}</small></span></span></td><td className="mono">{item.employeeNumber || "—"}</td><td>{item.subject || "Belum diatur"}</td><td className="mono">{item.username || "—"}</td><td>{item.isDutyTeacher ? <StatusPill tone="success">Guru piket</StatusPill> : <StatusPill>Guru</StatusPill>}</td><td><div className="table-actions"><Link href={`/teachers/${item.id}`} className="button button-secondary small"><Pencil />Edit</Link><form action={toggleDutyTeacherAction}><input type="hidden" name="id" value={item.id} /><button className="button button-secondary small"><BadgeCheck />{item.isDutyTeacher ? "Lepas" : "Jadikan piket"}</button></form></div></td></tr>)}</tbody></table></div></article>
    </section>
  </>;
}
