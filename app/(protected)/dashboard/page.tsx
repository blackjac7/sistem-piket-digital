import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { AlertCircle, ArrowRight, CalendarDays, CheckCircle2, ClipboardPlus, GraduationCap, UsersRound } from "lucide-react";
import { completeDutyAction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/db";
import { attendanceRecords, dutyCompletions, dutySchedules, teachers, users } from "@/db/schema";
import { requireRoles } from "@/lib/auth";
import { formatDateId, formatDateTimeId, jakartaDate, weekdayNames } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireRoles(["ADMIN", "GURU_PIKET", "GURU"]);
  const today = jakartaDate();
  const weekday = new Date(`${today}T12:00:00+07:00`).getUTCDay();
  const [[studentCount], [teacherCount], [pendingCount], [dutyCount], recent, todayDuty] = await Promise.all([
    db.select({ value: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.attendanceDate, today), eq(attendanceRecords.type, "SISWA"))),
    db.select({ value: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.attendanceDate, today), eq(attendanceRecords.type, "GURU"))),
    db.select({ value: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.attendanceDate, today), eq(attendanceRecords.isConfirmed, false))),
    db.select({ value: count() }).from(teachers).where(and(eq(teachers.isDutyTeacher, true), eq(teachers.isActive, true))),
    db.select({ id: attendanceRecords.id, name: attendanceRecords.personName, type: attendanceRecords.type, status: attendanceRecords.status, confirmed: attendanceRecords.isConfirmed, createdAt: attendanceRecords.createdAt, recorder: users.name }).from(attendanceRecords).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).orderBy(desc(attendanceRecords.createdAt)).limit(6),
    db.select({ id: dutySchedules.id, teacherId: dutySchedules.teacherId, name: teachers.name, shift: dutySchedules.shift, start: dutySchedules.startTime, end: dutySchedules.endTime, completedAt: dutyCompletions.completedAt }).from(dutySchedules).innerJoin(teachers, eq(dutySchedules.teacherId, teachers.id)).leftJoin(dutyCompletions, and(eq(dutyCompletions.scheduleId, dutySchedules.id), eq(dutyCompletions.dutyDate, today))).where(and(eq(dutySchedules.weekday, weekday), eq(dutySchedules.isActive, true))),
  ]);

  const stats = [
    { label: "Siswa tidak hadir", value: studentCount.value, detail: "catatan hari ini", icon: GraduationCap, tone: "blue" },
    { label: "Guru tidak hadir", value: teacherCount.value, detail: "catatan hari ini", icon: UsersRound, tone: "amber" },
    { label: "Perlu konfirmasi", value: pendingCount.value, detail: "menunggu tindak lanjut", icon: AlertCircle, tone: "red" },
    { label: "Guru piket aktif", value: dutyCount.value, detail: "dari 22 guru", icon: CheckCircle2, tone: "green" },
  ];
  const ownDuty = user.teacherId ? todayDuty.find((item) => item.teacherId === user.teacherId) : undefined;

  return <>
    <PageHeader title="Ringkasan hari ini" description={`${formatDateId(today)} · Kondisi operasional SMP IP YAKIN`} action={user.role === "ADMIN" || user.role === "GURU_PIKET" ? <Link href="/attendance" className="button button-primary"><ClipboardPlus /> Catat absensi</Link> : undefined} />
    {user.role === "GURU_PIKET" && <section className={`duty-check-card ${ownDuty?.completedAt ? "completed" : ""}`}><span className="stat-icon green"><CheckCircle2 /></span><div><strong>{ownDuty ? `Tugas piket ${ownDuty.shift.toLowerCase()}` : "Tidak ada jadwal piket hari ini"}</strong><small>{ownDuty?.completedAt ? `Sudah selesai pada ${formatDateTimeId(ownDuty.completedAt)}` : ownDuty ? "Setelah seluruh pencatatan selesai, tutup tugas dengan satu klik." : "Hubungi Admin IT jika jadwal belum sesuai."}</small></div>{ownDuty && !ownDuty.completedAt && <form action={completeDutyAction}><input type="hidden" name="scheduleId" value={ownDuty.id} /><SubmitButton pendingLabel="Menutup tugas...">Tugas piket selesai</SubmitButton></form>}{ownDuty?.completedAt && <StatusPill tone="success">Selesai</StatusPill>}</section>}
    <section className="stat-grid">{stats.map(({ label, value, detail, icon: Icon, tone }) => <article className="stat-card" key={label}><span className={`stat-icon ${tone}`}><Icon /></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>)}</section>
    <section className="dashboard-grid">
      <article className="panel wide">
        <div className="panel-header"><div><h2>Catatan terbaru</h2><p>Aktivitas absensi terakhir yang masuk</p></div><Link href="/attendance" className="text-link">Lihat semua <ArrowRight /></Link></div>
        <div className="table-scroll"><table><thead><tr><th>Nama</th><th>Jenis</th><th>Status</th><th>Konfirmasi</th><th>Pencatat</th><th>Waktu</th></tr></thead><tbody>
          {recent.map((record) => <tr key={record.id}><td><strong>{record.name}</strong></td><td>{record.type === "SISWA" ? "Siswa" : "Guru"}</td><td><StatusPill tone={record.status === "ALPA" ? "danger" : record.status === "SAKIT" ? "warning" : "info"}>{record.status}</StatusPill></td><td>{record.confirmed ? <StatusPill tone="success">Sudah</StatusPill> : <StatusPill tone="warning">Belum</StatusPill>}</td><td>{record.recorder}</td><td className="mono">{formatDateTimeId(record.createdAt)}</td></tr>)}
          {!recent.length && <tr><td colSpan={6} className="empty-state">Belum ada catatan absensi.</td></tr>}
        </tbody></table></div>
      </article>
      <article className="panel duty-panel">
        <div className="panel-header"><div><h2>Piket {weekdayNames[weekday] || "hari ini"}</h2><p>Petugas yang dijadwalkan</p></div><CalendarDays /></div>
        <div className="duty-list">{todayDuty.map((item) => <div className="duty-item" key={item.id}><span className="avatar">{item.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><strong>{item.name}</strong><small>{item.shift} · {item.start.slice(0, 5)}-{item.end.slice(0, 5)}</small></div>{item.completedAt ? <StatusPill tone="success">Selesai</StatusPill> : <StatusPill tone="info">Berjalan</StatusPill>}</div>)}{!todayDuty.length && <div className="empty-block"><CalendarDays /><p>Belum ada jadwal untuk hari ini.</p>{user.role === "ADMIN" && <Link href="/schedule">Atur jadwal</Link>}</div>}</div>
      </article>
    </section>
  </>;
}
