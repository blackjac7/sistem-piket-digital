import { desc, eq } from "drizzle-orm";
import { Activity, Download, GraduationCap, ShieldCheck, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { db } from "@/db";
import { attendanceRecords, auditLogs, schoolClasses, users } from "@/db/schema";
import { formatDateId, formatDateTimeId } from "@/lib/utils";
import { requireRoles } from "@/lib/auth";
import { attendanceFilterParams, filterAttendance, parseAttendanceFilter, type AttendanceFilter } from "@/lib/attendance-filters";

const statuses = ["SAKIT", "IZIN", "ALPA", "DINAS"] as const;
type StatusKey = Lowercase<(typeof statuses)[number]>;
type Summary = Record<StatusKey, number> & { total: number; pending: number };
type AttendanceRow = { id: number; name: string; type: "SISWA" | "GURU"; className: string | null; status: "SAKIT" | "IZIN" | "ALPA" | "DINAS"; date: string; notes: string | null; confirmed: boolean; recorder: string; createdAt: Date };
type GroupEntry = [string, { summary: Summary; records: AttendanceRow[] }];

function emptySummary(): Summary { return { sakit: 0, izin: 0, alpa: 0, dinas: 0, total: 0, pending: 0 }; }
function addToSummary(summary: Summary, status: string, pending: boolean) { const key = status.toLowerCase() as StatusKey; if (key in summary) summary[key] += 1; summary.total += 1; if (pending) summary.pending += 1; }
function tone(status: string) { return status === "ALPA" ? "danger" : status === "SAKIT" ? "warning" : status === "IZIN" ? "info" : "success"; }

function SummaryTable({ entries }: { entries: Array<[string, { summary: Summary }]> }) {
  return <div className="table-scroll"><table><thead><tr><th>Kelompok</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Dinas</th><th>Menunggu</th><th>Total</th></tr></thead><tbody>{entries.map(([name, group]) => <tr key={name}><td><strong>{name}</strong></td><td>{group.summary.sakit}</td><td>{group.summary.izin}</td><td>{group.summary.alpa}</td><td>{group.summary.dinas}</td><td>{group.summary.pending}</td><td><strong>{group.summary.total}</strong></td></tr>)}{!entries.length && <tr><td colSpan={7} className="empty-state">Belum ada data.</td></tr>}</tbody></table></div>;
}

function DetailList({ entries }: { entries: GroupEntry[] }) {
  return <div className="detail-accordion">{entries.map(([name, group]) => <details key={name}><summary><span><strong>{name}</strong><small>{group.records.length} catatan</small></span><b>{group.records.filter((record) => record.status === "ALPA").length} alpa</b></summary><div className="detail-status-columns">{statuses.map((status) => { const records = group.records.filter((record) => record.status === status); return <div key={status}><h4><StatusPill tone={tone(status)}>{status}</StatusPill><span>{records.length}</span></h4>{records.length ? <ul>{records.map((record) => <li key={record.id}><span><strong>{record.name}</strong><small>{formatDateId(record.date)} · dicatat {record.recorder}</small></span>{!record.confirmed && <StatusPill tone="warning">Tinjau</StatusPill>}</li>)}</ul> : <p className="detail-empty">Tidak ada</p>}</div>; })}</div></details>)}{!entries.length && <p className="empty-state">Belum ada data.</p>}</div>;
}

function FilterBar({ filter, classes, recorders }: { filter: AttendanceFilter; classes: string[]; recorders: string[] }) {
  const query = attendanceFilterParams(filter).toString();
  return <form className="report-filter-bar" method="get"><div className="report-filter-heading"><strong>Filter analisis</strong><small>Gunakan kombinasi filter untuk mempersempit data siswa atau guru.</small></div><div className="report-filter-grid"><label className="field"><span>Dari tanggal</span><input type="date" name="start" defaultValue={filter.start} /></label><label className="field"><span>Sampai tanggal</span><input type="date" name="end" defaultValue={filter.end} /></label><label className="field"><span>Jenis data</span><select name="type" defaultValue={filter.type || ""}><option value="">Siswa + Guru</option><option value="SISWA">Siswa</option><option value="GURU">Guru</option></select></label><label className="field"><span>Kelas</span><select name="class" defaultValue={filter.className || ""}><option value="">Semua kelas</option>{classes.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="field"><span>Status</span><select name="status" defaultValue={filter.status || ""}><option value="">Semua status</option><option value="SAKIT">Sakit</option><option value="IZIN">Izin</option><option value="ALPA">Alpa</option><option value="DINAS">Dinas</option></select></label><label className="field"><span>Konfirmasi</span><select name="confirmation" defaultValue={filter.confirmation || ""}><option value="">Semua</option><option value="PENDING">Menunggu</option><option value="CONFIRMED">Sudah</option></select></label><label className="field"><span>Pencatat</span><select name="recorder" defaultValue={filter.recorder || ""}><option value="">Semua pencatat</option>{recorders.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="field"><span>Cari nama</span><input name="q" defaultValue={filter.query} placeholder="Nama siswa atau guru" /></label></div><div className="report-filter-actions"><button className="button button-primary" type="submit">Terapkan filter</button><a className="button button-ghost" href="/reports">Reset</a><a className="button button-secondary" href={`/api/reports/xlsx${query ? `?${query}` : ""}`}>Unduh hasil Excel</a></div></form>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRoles(["ADMIN", "GURU_PIKET"]);
  const filter = parseAttendanceFilter(await searchParams);
  const [attendance, audit] = await Promise.all([
    db.select({ id: attendanceRecords.id, name: attendanceRecords.personName, type: attendanceRecords.type, className: schoolClasses.name, status: attendanceRecords.status, date: attendanceRecords.attendanceDate, notes: attendanceRecords.notes, confirmed: attendanceRecords.isConfirmed, recorder: users.name, createdAt: attendanceRecords.createdAt }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).orderBy(desc(attendanceRecords.attendanceDate), desc(attendanceRecords.createdAt)),
    db.select({ id: auditLogs.id, action: auditLogs.action, description: auditLogs.description, createdAt: auditLogs.createdAt, user: users.name }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id)).orderBy(desc(auditLogs.createdAt)).limit(20),
  ]);

  const filteredAttendance = filterAttendance(attendance, filter);
  const studentClasses = new Map<string, { summary: Summary; records: AttendanceRow[] }>();
  const teacherGroups = new Map<string, { summary: Summary; records: AttendanceRow[] }>();
  for (const record of filteredAttendance) {
    const target = record.type === "SISWA" ? studentClasses : teacherGroups;
    const key = record.type === "SISWA" ? record.className || "Tanpa kelas" : record.name;
    const group = target.get(key) || { summary: emptySummary(), records: [] };
    addToSummary(group.summary, record.status, !record.confirmed);
    group.records.push(record);
    target.set(key, group);
  }
  const classEntries = [...studentClasses.entries()].sort((a, b) => a[0].localeCompare(b[0], "id"));
  const teacherEntries = [...teacherGroups.entries()].sort((a, b) => b[1].summary.total - a[1].summary.total || a[0].localeCompare(b[0], "id"));

  return <>
    <PageHeader title="Rekap dan audit" description="Analisis absensi siswa dan guru dipisahkan agar tindak lanjut lebih tepat." action={<a className="button button-secondary" href={`/api/reports/xlsx${attendanceFilterParams(filter).toString() ? `?${attendanceFilterParams(filter).toString()}` : ""}`}><Download /> Unduh Excel</a>} />
    <FilterBar filter={filter} classes={[...new Set(attendance.map((item) => item.className).filter((item): item is string => Boolean(item)))].sort()} recorders={[...new Set(attendance.map((item) => item.recorder))].sort()} />
    <section className="report-stats"><article><GraduationCap /><span><strong>{filteredAttendance.filter((item) => item.type === "SISWA").length}</strong>Absensi siswa</span></article><article><UsersRound /><span><strong>{filteredAttendance.filter((item) => item.type === "GURU").length}</strong>Absensi guru</span></article><article><Activity /><span><strong>{filteredAttendance.filter((item) => !item.confirmed).length}</strong>Belum dikonfirmasi</span></article><article><ShieldCheck /><span><strong>{audit.length}</strong>Aktivitas audit</span></article></section>
    <section className="report-split-grid"><article className="panel"><div className="panel-header"><div><h2><GraduationCap /> Rekap absensi siswa</h2><p>Dipisahkan per kelas dan status ketidakhadiran.</p></div></div><SummaryTable entries={classEntries} /></article><article className="panel"><div className="panel-header"><div><h2><UsersRound /> Rekap absensi guru</h2><p>Setiap guru dianalisis sebagai individu.</p></div></div><SummaryTable entries={teacherEntries} /></article></section>
    <section className="report-split-grid report-detail-grid"><article className="panel"><div className="panel-header"><div><h2>Detail siswa per kelas</h2><p>Buka kelas untuk melihat nama yang sakit, izin, alpa, atau dinas.</p></div></div><DetailList entries={classEntries} /></article><article className="panel"><div className="panel-header"><div><h2>Detail absensi guru</h2><p>Buka nama guru untuk melihat seluruh riwayat statusnya.</p></div></div><DetailList entries={teacherEntries} /></article></section>
    <section className="panel audit-panel"><div className="panel-header"><div><h2><ShieldCheck /> Jejak audit</h2><p>20 aktivitas perubahan terakhir.</p></div></div><div className="audit-list">{audit.map((item) => <div className="audit-item" key={item.id}><span className="audit-dot" /><div><strong>{item.description}</strong><small>{item.user || "Sistem"} · {formatDateTimeId(item.createdAt)}</small></div><StatusPill>{item.action}</StatusPill></div>)}{!audit.length && <p className="empty-state">Belum ada aktivitas.</p>}</div></section>
  </>;
}
