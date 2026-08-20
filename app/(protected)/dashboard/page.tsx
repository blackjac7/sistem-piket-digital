import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { AlertCircle, ArrowRight, BarChart3, CalendarDays, CheckCircle2, ClipboardPlus, Fingerprint, GraduationCap, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { completeDutyAction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/db";
import { attendanceRecords, dutyCompletions, dutySchedules, teachers, users } from "@/db/schema";
import { requireRoles } from "@/lib/auth";
import { formatDateId, formatDateTimeId, jakartaDate, weekdayNames } from "@/lib/utils";
import { attendanceStatusMeta } from "@/lib/site-config";

export default async function DashboardPage() {
  const user = await requireRoles(["ADMIN", "GURU_PIKET", "GURU"]);
  const today = jakartaDate();
  if (user.role === "GURU") return <>
    <PageHeader title="Beranda" description={`${formatDateId(today)} · Akses mandiri akun guru`} />
    <section className="role-home-summary"><span className="stat-icon green"><ShieldCheck aria-hidden="true" /></span><div><strong>Akun Anda siap digunakan</strong><p>Gunakan halaman keamanan untuk mengganti password atau mengatur metode login perangkat.</p></div></section>
    <nav className="workspace-actions workspace-actions-single" aria-label="Akses cepat"><Link className="workspace-action tone-green" href="/security"><span><Fingerprint aria-hidden="true" /></span><div><strong>Keamanan login</strong><small>Password dan passkey</small></div><ArrowRight aria-hidden="true" /></Link></nav>
  </>;
  const weekday = new Date(`${today}T12:00:00+07:00`).getUTCDay();
  const [[studentCount], [teacherCount], [pendingCount], [dutyCount], [activeTeacherCount], recent, todayDuty] = await Promise.all([
    db.select({ value: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.attendanceDate, today), eq(attendanceRecords.type, "SISWA"))),
    db.select({ value: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.attendanceDate, today), eq(attendanceRecords.type, "GURU"))),
    db.select({ value: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.attendanceDate, today), eq(attendanceRecords.isConfirmed, false))),
    db.select({ value: count() }).from(teachers).where(and(eq(teachers.isDutyTeacher, true), eq(teachers.isActive, true))),
    db.select({ value: count() }).from(teachers).where(eq(teachers.isActive, true)),
    db.select({ id: attendanceRecords.id, name: attendanceRecords.personName, type: attendanceRecords.type, status: attendanceRecords.status, confirmed: attendanceRecords.isConfirmed, createdAt: attendanceRecords.createdAt, recorder: users.name }).from(attendanceRecords).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).orderBy(desc(attendanceRecords.createdAt)).limit(6),
    db.select({ id: dutySchedules.id, teacherId: dutySchedules.teacherId, name: teachers.name, start: dutySchedules.startTime, end: dutySchedules.endTime, completedAt: dutyCompletions.completedAt }).from(dutySchedules).innerJoin(teachers, eq(dutySchedules.teacherId, teachers.id)).leftJoin(dutyCompletions, and(eq(dutyCompletions.scheduleId, dutySchedules.id), eq(dutyCompletions.dutyDate, today))).where(and(eq(dutySchedules.weekday, weekday), eq(dutySchedules.isActive, true))),
  ]);

  const stats = user.role === "ADMIN" ? [
    { label: "Guru aktif", value: activeTeacherCount.value, detail: "tersedia di data guru", icon: UsersRound, tone: "blue" },
    { label: "Guru piket aktif", value: dutyCount.value, detail: "siap dijadwalkan", icon: CheckCircle2, tone: "green" },
    { label: "Perlu konfirmasi", value: pendingCount.value, detail: "catatan hari ini", icon: AlertCircle, tone: "red" },
  ] : [
    { label: "Siswa tidak hadir", value: studentCount.value, detail: "catatan hari ini", icon: GraduationCap, tone: "blue" },
    { label: "Guru tidak hadir", value: teacherCount.value, detail: "catatan hari ini", icon: UsersRound, tone: "amber" },
    { label: "Perlu konfirmasi", value: pendingCount.value, detail: "menunggu tindak lanjut", icon: AlertCircle, tone: "red" },
  ];
  const ownDuty = user.teacherId ? todayDuty.find((item) => item.teacherId === user.teacherId) : undefined;
  const quickActions = user.role === "ADMIN" ? [
    { href: "/schedule", label: "Jadwal piket", detail: "Atur guru per hari", icon: CalendarDays, tone: "blue" },
    { href: "/teachers", label: "Data guru", detail: "Kelola guru piket", icon: UsersRound, tone: "green" },
    { href: "/accounts", label: "Akun & akses", detail: "Password dan peran", icon: UserCog, tone: "amber" },
  ] : user.role === "GURU_PIKET" ? [
    { href: "/attendance", label: "Catat absensi", detail: "Siswa atau guru", icon: ClipboardPlus, tone: "blue" },
    { href: "/reports", label: "Buka rekap", detail: "Lihat tindak lanjut", icon: BarChart3, tone: "amber" },
    { href: "/security", label: "Keamanan", detail: "Password dan passkey", icon: Fingerprint, tone: "green" },
  ] : [];

  return <>
    <PageHeader title={user.role === "ADMIN" ? "Ringkasan pengelolaan" : "Ringkasan hari ini"} description={`${formatDateId(today)} · ${user.role === "ADMIN" ? "Data utama sistem dan guru piket" : "Kondisi operasional SMP IP YAKIN"}`} action={user.role === "ADMIN" ? <Link href="/schedule" className="button button-primary"><CalendarDays aria-hidden="true" /> Atur jadwal</Link> : <Link href="/attendance" className="button button-primary"><ClipboardPlus aria-hidden="true" /> Catat absensi</Link>} />
    {user.role === "GURU_PIKET" && <section className={`duty-check-card ${ownDuty?.completedAt ? "completed" : ""}`}><span className="stat-icon green"><CheckCircle2 /></span><div><strong>{ownDuty ? "Tugas piket hari ini" : "Tidak ada jadwal piket hari ini"}</strong><small>{ownDuty?.completedAt ? `Sudah selesai pada ${formatDateTimeId(ownDuty.completedAt)}` : ownDuty ? "Setelah seluruh pencatatan selesai, tutup tugas dengan satu klik." : "Hubungi Admin IT jika jadwal belum sesuai."}</small></div>{ownDuty && !ownDuty.completedAt && <form action={completeDutyAction}><input type="hidden" name="scheduleId" value={ownDuty.id} /><SubmitButton pendingLabel="Menutup tugas...">Tugas piket selesai</SubmitButton></form>}{ownDuty?.completedAt && <StatusPill tone="success">Selesai</StatusPill>}</section>}
    <nav className="workspace-actions" aria-label="Akses cepat">{quickActions.map(({ href, label, detail, icon: Icon, tone }) => <Link className={`workspace-action tone-${tone}`} href={href} key={href}><span><Icon aria-hidden="true" /></span><div><strong>{label}</strong><small>{detail}</small></div><ArrowRight aria-hidden="true" /></Link>)}</nav>
    <section className="stat-grid">{stats.map(({ label, value, detail, icon: Icon, tone }) => <article className={`stat-card tone-${tone}`} key={label}><span className={`stat-icon ${tone}`}><Icon /></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>)}</section>
    <section className="dashboard-grid">
      <article className="panel wide">
        <div className="panel-header"><div><h2>Catatan terbaru</h2><p>Aktivitas absensi terakhir yang masuk</p></div><Link href="/attendance" className="text-link">Lihat semua <ArrowRight /></Link></div>
        <div className="recent-mobile-list">{recent.map((record) => { const meta = attendanceStatusMeta[record.status]; return <article key={record.id}><span className="avatar">{record.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><strong>{record.name}</strong><small>{record.type === "SISWA" ? "Siswa" : "Guru"} · dicatat {record.recorder}</small><time>{formatDateTimeId(record.createdAt)}</time></div><div><StatusPill tone={meta.pillTone}>{meta.label}</StatusPill><StatusPill tone={record.confirmed ? "success" : "warning"}>{record.confirmed ? "Selesai" : "Tinjau"}</StatusPill></div></article>; })}{!recent.length && <div className="empty-state">Belum ada catatan absensi.</div>}</div>
        <div className="table-scroll recent-table"><table><thead><tr><th>Nama</th><th>Jenis</th><th>Status</th><th>Konfirmasi</th><th>Pencatat</th><th>Waktu</th></tr></thead><tbody>
          {recent.map((record) => { const meta = attendanceStatusMeta[record.status]; return <tr key={record.id}><td><strong>{record.name}</strong></td><td>{record.type === "SISWA" ? "Siswa" : "Guru"}</td><td><StatusPill tone={meta.pillTone}>{meta.label}</StatusPill></td><td>{record.confirmed ? <StatusPill tone="success">Sudah</StatusPill> : <StatusPill tone="warning">Belum</StatusPill>}</td><td>{record.recorder}</td><td className="mono">{formatDateTimeId(record.createdAt)}</td></tr>; })}
          {!recent.length && <tr><td colSpan={6} className="empty-state">Belum ada catatan absensi.</td></tr>}
        </tbody></table></div>
      </article>
      <article className="panel duty-panel">
        <div className="panel-header"><div><h2>Piket {weekdayNames[weekday] || "hari ini"}</h2><p>Petugas yang dijadwalkan</p></div><CalendarDays /></div>
        <div className="duty-list">{todayDuty.map((item) => <div className="duty-item" key={item.id}><span className="avatar">{item.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><strong>{item.name}</strong><small>{item.start.slice(0, 5)}-{item.end.slice(0, 5)}</small></div>{item.completedAt ? <StatusPill tone="success">Selesai</StatusPill> : <StatusPill tone="info">Berjalan</StatusPill>}</div>)}{!todayDuty.length && <div className="empty-block"><CalendarDays /><p>Belum ada jadwal untuk hari ini.</p>{user.role === "ADMIN" && <Link href="/schedule">Atur jadwal</Link>}</div>}</div>
      </article>
    </section>
  </>;
}
