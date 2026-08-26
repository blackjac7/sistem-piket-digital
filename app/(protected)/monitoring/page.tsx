import { AlertTriangle, CalendarCheck2, CalendarDays, CheckCircle2, ChevronDown, Clock3, Download, GraduationCap, Layers3, ListChecks, Percent, UserRoundCheck, UsersRound } from "lucide-react";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { db } from "@/db";
import { schoolClasses } from "@/db/schema";
import { attendanceFilterParams, parseAttendanceFilter } from "@/lib/attendance-filters";
import { requireRoles } from "@/lib/auth";
import { getMonitoringData, normalizeMonitoringPeriod } from "@/lib/monitoring";
import { attendanceStatusMeta } from "@/lib/site-config";
import { formatDateId, formatDateTimeId } from "@/lib/utils";

const statusKeys = Object.keys(attendanceStatusMeta) as Array<keyof typeof attendanceStatusMeta>;

function initials(name: string) {
  return name.split(" ").map((word) => word[0]).join("").slice(0, 2);
}

export default async function MonitoringPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRoles(["ADMIN", "WAKASEK_KURIKULUM"]);
  const params = await searchParams;
  const rawPeriod = Array.isArray(params.period) ? params.period[0] : params.period;
  const period = normalizeMonitoringPeriod(rawPeriod);
  const filter = parseAttendanceFilter(params);
  const [data, classes] = await Promise.all([
    getMonitoringData(period, { className: filter.className, status: filter.status, type: filter.type }),
    db.select({ name: schoolClasses.name }).from(schoolClasses).where(eq(schoolClasses.isActive, true)).orderBy(schoolClasses.grade, schoolClasses.name),
  ]);
  const topClass = data.classSummary[0];
  const priorityCount = data.summary.overdue + data.attendanceSummary.pending;
  const activeFilters = [filter.type, filter.className, filter.status].filter(Boolean).length;
  const stats = [
    { label: "Keterlaksanaan", value: `${data.summary.completionRate}%`, detail: `${data.summary.completed}/${data.summary.scheduled} jadwal selesai`, icon: Percent, tone: "green" },
    { label: "Belum diselesaikan", value: data.summary.overdue, detail: "jadwal yang sudah lewat", icon: AlertTriangle, tone: "red" },
    { label: "Menunggu konfirmasi", value: data.attendanceSummary.pending, detail: "catatan perlu ditinjau", icon: Clock3, tone: "amber" },
    { label: "Total absensi", value: data.attendanceSummary.total, detail: `${data.attendanceSummary.students} siswa · ${data.attendanceSummary.teachers} guru`, icon: GraduationCap, tone: "blue" },
  ];
  const recentOccurrences = data.occurrences.slice(0, 20);
  const remainingOccurrences = data.occurrences.slice(20, 100);

  return <>
    <PageHeader title="Pemantauan kurikulum" description={`${formatDateId(data.start)} sampai ${formatDateId(data.end)} · Fokus pada data yang memerlukan tindak lanjut.`} action={<a className="button button-primary" href={`/api/reports/monitoring?period=${period}&${attendanceFilterParams(filter).toString()}`}><Download aria-hidden="true" /> Ekspor Excel</a>} />
    {data.summary.nonOperationalDays > 0 && <section className="calendar-guidance dashboard-calendar-notice" aria-label="Hari yang dikecualikan"><CalendarDays aria-hidden="true" /><div><strong>{data.summary.nonOperationalDays} hari non-operasional dikecualikan</strong><p>Hari tanpa operasional, libur, dan tutup darurat tidak masuk perhitungan keterlaksanaan maupun rekap absensi.</p></div><StatusPill tone="warning">Kalender diterapkan</StatusPill></section>}

    <details className="filter-disclosure">
      <summary><span><strong>Filter data</strong><small>{period} hari · {activeFilters ? `${activeFilters} filter aktif` : "Semua absensi"}</small></span><ChevronDown aria-hidden="true" /></summary>
      <form className="monitoring-filter" method="get"><label className="field"><span>Periode</span><select name="period" defaultValue={period}>{[7, 30, 90].map((value) => <option value={value} key={value}>{value} hari</option>)}</select></label><label className="field"><span>Jenis absensi</span><select name="type" defaultValue={filter.type || ""}><option value="">Siswa dan guru</option><option value="SISWA">Siswa</option><option value="GURU">Guru</option></select></label><label className="field"><span>Kelas</span><select name="class" defaultValue={filter.className || ""}><option value="">Semua kelas</option>{classes.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label><label className="field"><span>Status</span><select name="status" defaultValue={filter.status || ""}><option value="">Semua status</option>{statusKeys.map((status) => <option value={status} key={status}>{attendanceStatusMeta[status].label}</option>)}</select></label><div><button className="button button-primary" type="submit">Terapkan</button><a className="button button-ghost" href="/monitoring">Reset</a></div></form>
    </details>

    <section className={`monitoring-insight ${priorityCount ? "needs-attention" : "on-track"}`}><span>{priorityCount ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}</span><div><strong>{priorityCount ? `${priorityCount} item perlu ditindaklanjuti` : "Tidak ada tindak lanjut mendesak"}</strong><p>{priorityCount ? `${data.summary.overdue} jadwal belum selesai dan ${data.attendanceSummary.pending} catatan belum dikonfirmasi.` : `Keterlaksanaan ${data.summary.completionRate}% dan seluruh catatan telah dikonfirmasi.`}</p></div><StatusPill tone={priorityCount ? "warning" : "success"}>{priorityCount ? "Perlu perhatian" : "Terkendali"}</StatusPill></section>
    <section className="stat-grid curriculum-stat-grid">{stats.map(({ label, value, detail, icon: Icon, tone }) => <article className={`stat-card tone-${tone}`} key={label}><span className={`stat-icon ${tone}`}><Icon aria-hidden="true" /></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>)}</section>

    <section className="monitoring-disclosures" aria-label="Analisis lanjutan">
      <details className="analysis-disclosure" open={data.summary.overdue > 0}>
        <summary><span className="disclosure-icon red"><CalendarCheck2 aria-hidden="true" /></span><span><strong>Keterlaksanaan guru piket</strong><small>{data.summary.completed} selesai · {data.summary.overdue} belum · {data.summary.inProgress} berjalan</small></span><ChevronDown aria-hidden="true" /></summary>
        <div className="analysis-content"><section className="monitoring-grid"><article className="panel chart-panel"><div className="panel-header"><div><h2><CalendarCheck2 aria-hidden="true" /> Tren keterlaksanaan</h2><p>Persentase jadwal selesai per hari</p></div></div><div className="compliance-chart" role="img" aria-label="Grafik persentase keterlaksanaan piket">{data.trend.map((item) => { const rate = item.scheduled ? Math.round(item.completed / item.scheduled * 100) : 0; return <div className="chart-column" key={item.date} title={`${formatDateId(item.date)}: ${item.completed} dari ${item.scheduled} jadwal selesai`}><span>{item.scheduled ? `${rate}%` : "-"}</span><div className="chart-track"><i style={{ height: `${item.scheduled ? Math.max(rate, 5) : 2}%` }} /></div><small>{item.date.slice(8, 10)}/{item.date.slice(5, 7)}</small></div>; })}</div><div className="chart-mobile-summary" aria-label="Rincian keterlaksanaan per hari">{data.trend.slice(-8).map((item) => { const rate = item.scheduled ? Math.round(item.completed / item.scheduled * 100) : 0; return <div key={item.date}><span><strong>{item.date.slice(8, 10)}/{item.date.slice(5, 7)}</strong><small>{item.completed}/{item.scheduled} selesai</small></span><b>{item.scheduled ? `${rate}%` : "-"}</b></div>; })}</div></article><article className="panel teacher-performance"><div className="panel-header"><div><h2><UserRoundCheck aria-hidden="true" /> Guru piket</h2><p>Urutan keterlaksanaan terendah</p></div></div><div className="teacher-monitor-list">{data.teacherSummary.map((item) => <div key={item.teacherId}><span className="avatar">{initials(item.teacherName)}</span><span><strong>{item.teacherName}</strong><small>{item.overdue} belum · {item.attendanceCount} catatan</small></span><span className="teacher-rate"><strong>{item.completionRate}%</strong><small>{item.completed}/{item.scheduled}</small></span></div>)}{!data.teacherSummary.length && <p className="empty-state">Belum ada jadwal guru piket.</p>}</div></article></section></div>
      </details>

      <details className="analysis-disclosure">
        <summary><span className="disclosure-icon blue"><GraduationCap aria-hidden="true" /></span><span><strong>Absensi siswa dan guru</strong><small>{data.attendanceSummary.students} siswa · {data.attendanceSummary.teachers} guru · {data.attendanceSummary.pending} menunggu</small></span><ChevronDown aria-hidden="true" /></summary>
        <div className="analysis-content"><section className="monitoring-grid"><AttendanceDistribution title="Status absensi siswa" total={data.attendanceSummary.students} counts={data.attendanceSummary.studentStatusCounts} icon="student" /><AttendanceDistribution title="Status absensi guru" total={data.attendanceSummary.teachers} counts={data.attendanceSummary.teacherStatusCounts} icon="teacher" /></section><section className="analytics-grid"><AttendanceTrend title="Tren absensi siswa" data={data.trend.map((item) => ({ date: item.date, total: item.studentAttendanceCount, statuses: item.studentAttendanceStatuses }))} /><AttendanceTrend title="Tren absensi guru" data={data.trend.map((item) => ({ date: item.date, total: item.teacherAttendanceCount, statuses: item.teacherAttendanceStatuses }))} /></section></div>
      </details>

      <details className="analysis-disclosure">
        <summary><span className="disclosure-icon amber"><ListChecks aria-hidden="true" /></span><span><strong>Detail kelas dan riwayat</strong><small>{data.classSummary.length} kelas · {data.occurrences.length} pelaksanaan jadwal</small></span><ChevronDown aria-hidden="true" /></summary>
        <div className="analysis-content"><section className="analytics-grid analytics-grid-secondary"><article className="panel class-ranking"><div className="panel-header"><div><h2><Layers3 aria-hidden="true" /> Kelas perlu perhatian</h2><p>Diurutkan dari catatan terbanyak</p></div></div><div className="ranking-list">{data.classSummary.slice(0, 8).map((item, index) => <div className="ranking-row" key={item.className}><span className="ranking-index">{index + 1}</span><span className="ranking-name"><strong>{item.className}</strong><small>{item.pending ? `${item.pending} belum dikonfirmasi` : "Semua terkonfirmasi"}</small></span><span className="ranking-value"><strong>{item.total}</strong><small>{item.ALPA} alpa</small></span></div>)}{!data.classSummary.length && <p className="empty-state">Belum ada data absensi siswa.</p>}</div>{topClass && <div className="panel-callout"><Layers3 aria-hidden="true" /><span><strong>Catatan terbanyak</strong><small>{topClass.className} memiliki {topClass.total} catatan pada periode ini.</small></span></div>}</article><article className="panel priority-summary"><div className="panel-header"><div><h2><AlertTriangle aria-hidden="true" /> Ringkasan tindak lanjut</h2><p>Angka yang perlu diperiksa</p></div></div><dl className="priority-list"><div><dt>Jadwal belum selesai</dt><dd>{data.summary.overdue}</dd></div><div><dt>Absensi belum dikonfirmasi</dt><dd>{data.attendanceSummary.pending}</dd></div><div><dt>Alpa siswa</dt><dd>{data.attendanceSummary.studentStatusCounts.ALPA}</dd></div><div><dt>Alpa guru</dt><dd>{data.attendanceSummary.teacherStatusCounts.ALPA}</dd></div></dl></article></section><OccurrenceHistory items={recentOccurrences} remainingItems={remainingOccurrences} /></div>
      </details>
    </section>
  </>;
}

type StatusCounts = Record<keyof typeof attendanceStatusMeta, number>;

function AttendanceDistribution({ title, total, counts, icon }: { title: string; total: number; counts: StatusCounts; icon: "student" | "teacher" }) {
  const Icon = icon === "student" ? GraduationCap : UsersRound;
  return <article className="panel attendance-distribution"><div className="panel-header"><div><h2><Icon aria-hidden="true" /> {title}</h2><p>{total} catatan pada periode terpilih</p></div></div><div className="distribution-body">{statusKeys.map((status) => { const meta = attendanceStatusMeta[status]; const value = counts[status]; const percentage = total ? Math.round(value / total * 100) : 0; return <div className="distribution-row" key={status}><div><span className="distribution-label"><i style={{ background: meta.color }} />{meta.label}</span><strong>{value}</strong></div><div className="distribution-track"><i style={{ width: `${percentage}%`, background: meta.color }} /></div><small>{percentage}%</small></div>; })}</div></article>;
}

function AttendanceTrend({ title, data }: { title: string; data: Array<{ date: string; total: number; statuses: StatusCounts }> }) {
  return <article className="panel attendance-trend-panel"><div className="panel-header"><div><h2><GraduationCap aria-hidden="true" /> {title}</h2><p>Jumlah catatan per hari</p></div></div><div className="attendance-stack-chart" role="img" aria-label={title}>{data.map((item) => <div className="stack-column" key={item.date} title={`${formatDateId(item.date)}: ${item.total} catatan`}><span>{item.total || "-"}</span><div className="stack-track">{statusKeys.map((status) => <i key={status} style={{ height: `${item.total ? Math.max(item.statuses[status] / item.total * 100, item.statuses[status] ? 4 : 0) : 0}%`, background: attendanceStatusMeta[status].color }} />)}</div><small>{item.date.slice(8, 10)}</small></div>)}</div><div className="stack-legend">{statusKeys.map((status) => <span key={status}><i style={{ background: attendanceStatusMeta[status].color }} />{attendanceStatusMeta[status].label}</span>)}</div></article>;
}

type Occurrence = Awaited<ReturnType<typeof getMonitoringData>>["occurrences"][number];

function OccurrenceCard({ item }: { item: Occurrence }) {
  return <article className="mobile-record"><div className="mobile-record-heading"><span className="avatar">{initials(item.teacherName)}</span><span><strong>{item.teacherName}</strong><small>{item.weekday} · {formatDateId(item.date)}</small></span><StatusPill tone={item.status === "SELESAI" ? "success" : item.status === "BERJALAN" ? "info" : "danger"}>{item.status === "SELESAI" ? "Selesai" : item.status === "BERJALAN" ? "Berjalan" : "Belum"}</StatusPill></div><dl className="mobile-record-details"><div><dt>Jam</dt><dd>{item.startTime.slice(0, 5)}-{item.endTime.slice(0, 5)}</dd></div><div><dt>Aktivitas</dt><dd>{item.attendanceCount} catatan</dd></div></dl><p className="mobile-record-note">{item.calendarTitle ? `${item.calendarTitle} · ` : ""}{item.completedAt ? `Diselesaikan ${formatDateTimeId(item.completedAt)}` : "Belum ada waktu penyelesaian"}</p></article>;
}

function OccurrenceHistory({ items, remainingItems }: { items: Occurrence[]; remainingItems: Occurrence[] }) {
  const allItems = [...items, ...remainingItems];
  return <article className="panel monitoring-table"><div className="panel-header"><div><h2><ListChecks aria-hidden="true" /> Riwayat keterlaksanaan</h2><p>Status jadwal dalam periode terpilih</p></div></div><div className="mobile-data-view"><div className="mobile-record-list">{items.map((item) => <OccurrenceCard item={item} key={`${item.teacherId}-${item.date}`} />)}{remainingItems.length > 0 && <details className="mobile-more-records"><summary>Lihat {remainingItems.length} riwayat lainnya</summary>{remainingItems.map((item) => <OccurrenceCard item={item} key={`${item.teacherId}-${item.date}`} />)}</details>}{!allItems.length && <p className="empty-state">Belum ada jadwal pada periode ini.</p>}</div></div><div className="table-scroll desktop-data-view"><table><thead><tr><th>Tanggal</th><th>Guru piket</th><th>Jam</th><th>Aktivitas</th><th>Status</th><th>Waktu selesai</th></tr></thead><tbody>{allItems.map((item) => <tr key={`${item.teacherId}-${item.date}`}><td><strong>{item.weekday}</strong><small className="table-subtitle">{formatDateId(item.date)}</small></td><td>{item.teacherName}</td><td className="mono">{item.startTime.slice(0, 5)}-{item.endTime.slice(0, 5)}</td><td>{item.attendanceCount} catatan</td><td><StatusPill tone={item.status === "SELESAI" ? "success" : item.status === "BERJALAN" ? "info" : "danger"}>{item.status === "SELESAI" ? "Selesai" : item.status === "BERJALAN" ? "Berjalan" : "Belum"}</StatusPill></td><td>{item.completedAt ? formatDateTimeId(item.completedAt) : "-"}</td></tr>)}{!allItems.length && <tr><td colSpan={6} className="empty-state">Belum ada jadwal pada periode ini.</td></tr>}</tbody></table></div></article>;
}
