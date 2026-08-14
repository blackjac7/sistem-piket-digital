import { and, count, eq } from "drizzle-orm";
import { AlertTriangle, ArrowUpCircle, DatabaseBackup } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PromotionForm } from "@/components/promotion-form";
import { db } from "@/db";
import { academicYears, schoolClasses, students } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export default async function AcademicYearsPage() {
  await requireAdmin();
  const [currentYear] = await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  const classRows = await db.select({
    id: schoolClasses.id,
    name: schoolClasses.name,
    grade: schoolClasses.grade,
    total: count(students.id),
  }).from(schoolClasses).leftJoin(students, and(
    eq(schoolClasses.id, students.classId),
    eq(students.isActive, true),
    eq(students.status, "AKTIF"),
  )).groupBy(schoolClasses.id).orderBy(schoolClasses.grade, schoolClasses.name);
  const classes = classRows.map((item) => ({ ...item, total: Number(item.total) }));
  const nextStart = currentYear?.endYear || new Date().getFullYear() + 1;

  return <>
    <PageHeader
      title="Kenaikan kelas"
      description={`Tahun ajaran aktif: ${currentYear?.name || "Belum diatur"}. Pilih rombel tetap atau susun ulang melalui Excel.`}
      action={<a className="button button-secondary" href="/api/exports/students"><DatabaseBackup /> Unduh backup siswa</a>}
    />
    <section className="promotion-layout">
      <article className="panel promotion-form">
        <div className="panel-header"><div><h2><ArrowUpCircle /> Penempatan tahun ajaran baru</h2><p>Riwayat kelas lama tetap tersimpan</p></div></div>
        <PromotionForm classes={classes} defaultTargetYear={`${nextStart}/${nextStart + 1}`} />
      </article>
      <aside className="panel process-guide">
        <div className="panel-header"><div><h2><AlertTriangle /> Sebelum memproses</h2><p>Checklist pergantian tahun ajaran</p></div></div>
        <ol>
          <li>Pastikan seluruh absensi tahun lama selesai.</li>
          <li>Unduh backup data siswa.</li>
          <li>Pilih metode sesuai keputusan sekolah.</li>
          <li>Untuk rombel baru, selalu gunakan template terbaru.</li>
          <li>Kelas 9 otomatis menjadi alumni/lulus.</li>
          <li>Impor siswa baru kelas 7 setelah proses selesai.</li>
        </ol>
      </aside>
    </section>
  </>;
}
