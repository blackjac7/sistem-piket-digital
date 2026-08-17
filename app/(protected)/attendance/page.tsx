import { and, desc, eq, isNotNull } from "drizzle-orm";
import { deleteAttendanceAction } from "@/app/actions";
import { ClickAttendance } from "@/components/click-attendance";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { db } from "@/db";
import { attendanceRecords, schoolClasses, students, teachers, users } from "@/db/schema";
import { formatDateId, formatDateTimeId } from "@/lib/utils";
import { requireRoles } from "@/lib/auth";

export default async function AttendancePage() {
  await requireRoles(["ADMIN", "GURU_PIKET"]);
  const [classes, studentList, teacherList, records] = await Promise.all([
    db.select({ id: schoolClasses.id, name: schoolClasses.name }).from(schoolClasses).where(eq(schoolClasses.isActive, true)).orderBy(schoolClasses.grade, schoolClasses.name),
    db.select({ id: students.id, name: students.name, classId: students.classId }).from(students).where(and(eq(students.isActive, true), isNotNull(students.classId))).orderBy(students.name),
    db.select({ id: teachers.id, name: teachers.name, subject: teachers.subject }).from(teachers).where(eq(teachers.isActive, true)).orderBy(teachers.name),
    db.select({ id: attendanceRecords.id, name: attendanceRecords.personName, type: attendanceRecords.type, className: schoolClasses.name, status: attendanceRecords.status, date: attendanceRecords.attendanceDate, notes: attendanceRecords.notes, confirmed: attendanceRecords.isConfirmed, recorder: users.name, createdAt: attendanceRecords.createdAt }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).orderBy(desc(attendanceRecords.attendanceDate), desc(attendanceRecords.createdAt)).limit(100),
  ]);
  return <>
    <PageHeader title="Absensi sekolah" description="Catat ketidakhadiran siswa dan guru secara terpusat." />
    <section className="split-layout">
      <article className="panel click-panel">
        <div className="panel-header"><div><h2>Absensi cepat</h2><p>Semua cukup diklik, tanpa mengetik nama</p></div></div>
        <ClickAttendance classes={classes} students={studentList.map((item) => ({ ...item, classId: item.classId! }))} teachers={teacherList} />
      </article>
      <article className="panel data-panel">
        <div className="panel-header"><div><h2>Riwayat absensi</h2><p>100 catatan terbaru</p></div></div>
        <div className="mobile-data-view"><div className="mobile-record-list">{records.map((item) => <article className="mobile-record" key={item.id}>
          <div className="mobile-record-heading"><span className="avatar">{item.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{item.name}</strong><small>{item.type === "SISWA" ? `Siswa · ${item.className || "Tanpa kelas"}` : "Guru"}</small></span><StatusPill tone={item.status === "ALPA" ? "danger" : item.status === "SAKIT" ? "warning" : "info"}>{item.status}</StatusPill></div>
          <dl className="mobile-record-details"><div><dt>Tanggal</dt><dd>{formatDateId(item.date)}</dd></div><div><dt>Konfirmasi</dt><dd>{item.confirmed ? "Sudah" : "Belum"}</dd></div></dl>
          <p className="mobile-record-note">{item.notes || "Tanpa keterangan"} · Dicatat {item.recorder} pada {formatDateTimeId(item.createdAt)}</p>
          <div className="mobile-record-actions"><form action={deleteAttendanceAction}><input type="hidden" name="id" value={item.id} /><ConfirmSubmitButton message={`Hapus catatan ${item.name}? Tindakan ini tidak dapat dibatalkan.`} /></form></div>
        </article>)}{!records.length && <p className="empty-state">Belum ada data absensi.</p>}</div></div>
        <div className="table-scroll desktop-data-view"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Status</th><th>Tanggal</th><th>Konfirmasi</th><th>Pencatat</th><th /></tr></thead><tbody>
          {records.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small className="table-subtitle">{item.type === "SISWA" ? "Siswa" : "Guru"} · {item.notes || "Tanpa keterangan"}</small></td><td>{item.className || "Guru"}</td><td><StatusPill tone={item.status === "ALPA" ? "danger" : item.status === "SAKIT" ? "warning" : "info"}>{item.status}</StatusPill></td><td>{formatDateId(item.date)}<small className="table-subtitle mono">{formatDateTimeId(item.createdAt)}</small></td><td>{item.confirmed ? <StatusPill tone="success">Sudah</StatusPill> : <StatusPill tone="warning">Belum</StatusPill>}</td><td>{item.recorder}</td><td><form action={deleteAttendanceAction}><input type="hidden" name="id" value={item.id} /><ConfirmSubmitButton message={`Hapus catatan ${item.name}? Tindakan ini tidak dapat dibatalkan.`} /></form></td></tr>)}
          {!records.length && <tr><td colSpan={7} className="empty-state">Belum ada data absensi.</td></tr>}
        </tbody></table></div>
      </article>
    </section>
  </>;
}
