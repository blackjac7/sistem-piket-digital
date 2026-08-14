import { AlertTriangle, CalendarCheck2, CheckCircle2, Download, ListChecks, Percent, UserRoundCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { requireRoles } from "@/lib/auth";
import { getMonitoringData, normalizeMonitoringPeriod } from "@/lib/monitoring";
import { formatDateId, formatDateTimeId } from "@/lib/utils";

export default async function MonitoringPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireRoles(["ADMIN", "WAKASEK_KURIKULUM"]);
  const { period: rawPeriod } = await searchParams;
  const period = normalizeMonitoringPeriod(rawPeriod);
  const data = await getMonitoringData(period);
  const stats = [
    { label: "Jadwal dalam periode", value: data.summary.scheduled, detail: `${period} hari terakhir`, icon: CalendarCheck2, tone: "blue" },
    { label: "Piket selesai", value: data.summary.completed, detail: "dikonfirmasi guru piket", icon: CheckCircle2, tone: "green" },
    { label: "Belum diselesaikan", value: data.summary.overdue, detail: "jadwal yang sudah lewat", icon: AlertTriangle, tone: "red" },
    { label: "Keterlaksanaan", value: `${data.summary.completionRate}%`, detail: `${data.summary.totalActivity} catatan absensi dibuat`, icon: Percent, tone: "amber" },
  ];

  return <>
    <PageHeader title="Pemantauan guru piket" description={`Keterlaksanaan tugas dan aktivitas pencatatan ${formatDateId(data.start)} sampai ${formatDateId(data.end)}.`} action={<a className="button button-primary" href={`/api/reports/monitoring?period=${period}`}><Download /> Ekspor laporan Excel</a>} />
    <nav className="period-filter" aria-label="Periode pemantauan">{[7, 30, 90].map((value) => <a key={value} href={`/monitoring?period=${value}`} aria-current={period === value ? "page" : undefined}>{value} hari</a>)}</nav>
    <section className="stat-grid">{stats.map(({ label, value, detail, icon: Icon, tone }) => <article className="stat-card" key={label}><span className={`stat-icon ${tone}`}><Icon /></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>)}</section>

    <section className="monitoring-grid">
      <article className="panel chart-panel">
        <div className="panel-header"><div><h2><CalendarCheck2 /> Keterlaksanaan 14 hari terakhir</h2><p>Perbandingan jadwal yang selesai pada setiap hari</p></div></div>
        <div className="compliance-chart" role="img" aria-label="Grafik persentase keterlaksanaan piket 14 hari terakhir">
          {data.trend.map((item) => { const rate = item.scheduled ? Math.round(item.completed / item.scheduled * 100) : 0; return <div className="chart-column" key={item.date} title={`${formatDateId(item.date)}: ${item.completed} dari ${item.scheduled} jadwal selesai`}><span>{item.scheduled ? `${rate}%` : "-"}</span><div className="chart-track"><i style={{ height: `${item.scheduled ? Math.max(rate, 5) : 2}%` }} /></div><small>{item.date.slice(8, 10)}/{item.date.slice(5, 7)}</small></div>; })}
        </div>
      </article>
      <article className="panel teacher-performance">
        <div className="panel-header"><div><h2><UserRoundCheck /> Ringkasan per guru</h2><p>Status sesuai jadwal dan shift</p></div></div>
        <div className="teacher-monitor-list">{data.teacherSummary.map((item) => { const rate = item.scheduled ? Math.round(item.completed / item.scheduled * 100) : 0; return <div key={`${item.teacherId}-${item.shift}`}><span className="avatar">{item.teacherName.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{item.teacherName}</strong><small>{item.shift} · {item.attendanceCount} catatan</small></span><span className="teacher-rate"><strong>{rate}%</strong><small>{item.completed}/{item.scheduled} selesai</small></span></div>; })}</div>
      </article>
    </section>

    <article className="panel monitoring-table">
      <div className="panel-header"><div><h2><ListChecks /> Riwayat keterlaksanaan</h2><p>Status jadwal terbaru dalam periode terpilih</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Tanggal</th><th>Guru piket</th><th>Shift</th><th>Aktivitas</th><th>Status</th><th>Waktu selesai</th></tr></thead><tbody>
        {data.occurrences.slice(0, 100).map((item) => <tr key={`${item.teacherId}-${item.date}-${item.shift}`}><td><strong>{item.weekday}</strong><small className="table-subtitle">{formatDateId(item.date)}</small></td><td>{item.teacherName}</td><td>{item.shift}<small className="table-subtitle mono">{item.startTime.slice(0, 5)}-{item.endTime.slice(0, 5)}</small></td><td>{item.attendanceCount} catatan</td><td><StatusPill tone={item.status === "SELESAI" ? "success" : item.status === "BERJALAN" ? "info" : "danger"}>{item.status === "SELESAI" ? "Selesai" : item.status === "BERJALAN" ? "Berjalan" : "Belum"}</StatusPill></td><td>{item.completedAt ? formatDateTimeId(item.completedAt) : "-"}</td></tr>)}
        {!data.occurrences.length && <tr><td colSpan={6} className="empty-state">Belum ada jadwal pada periode ini.</td></tr>}
      </tbody></table></div>
    </article>
  </>;
}
