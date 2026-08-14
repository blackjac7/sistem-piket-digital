import { count, desc, eq } from "drizzle-orm";
import { Activity, ClipboardList, Download, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { db } from "@/db";
import { attendanceRecords, auditLogs, schoolClasses, users } from "@/db/schema";
import { formatDateTimeId } from "@/lib/utils";
import { requireRoles } from "@/lib/auth";

export default async function ReportsPage() {
  await requireRoles(["ADMIN", "GURU_PIKET"]);
  const [[allCount], [pending], grouped, audit] = await Promise.all([
    db.select({ value: count() }).from(attendanceRecords),
    db.select({ value: count() }).from(attendanceRecords).where(eq(attendanceRecords.isConfirmed, false)),
    db.select({ className: schoolClasses.name, type: attendanceRecords.type, status: attendanceRecords.status, total: count() }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).groupBy(schoolClasses.name, attendanceRecords.type, attendanceRecords.status).orderBy(schoolClasses.name),
    db.select({ id: auditLogs.id, action: auditLogs.action, entity: auditLogs.entity, description: auditLogs.description, createdAt: auditLogs.createdAt, user: users.name }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id)).orderBy(desc(auditLogs.createdAt)).limit(20),
  ]);
  const classSummary = new Map<string, { sakit: number; izin: number; alpa: number; dinas: number; total: number }>();
  grouped.forEach((item) => { const key = item.className || (item.type === "GURU" ? "Guru" : "Tanpa kelas"); const current = classSummary.get(key) || { sakit: 0, izin: 0, alpa: 0, dinas: 0, total: 0 }; const value = Number(item.total); current[item.status.toLowerCase() as "sakit" | "izin" | "alpa" | "dinas"] += value; current.total += value; classSummary.set(key, current); });
  return <><PageHeader title="Rekap dan audit" description="Ringkasan ketidakhadiran serta jejak perubahan sistem." action={<a className="button button-secondary" href="/api/reports/csv"><Download /> Unduh CSV</a>} /><section className="report-stats"><article><ClipboardList /><span><strong>{allCount.value}</strong>Total catatan</span></article><article><Activity /><span><strong>{pending.value}</strong>Belum dikonfirmasi</span></article><article><ShieldCheck /><span><strong>{audit.length}</strong>Aktivitas terakhir</span></article></section><section className="dashboard-grid"><article className="panel wide"><div className="panel-header"><div><h2>Ringkasan per kelompok</h2><p>Akumulasi seluruh data</p></div></div><div className="table-scroll"><table><thead><tr><th>Kelompok</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Dinas</th><th>Total</th></tr></thead><tbody>{[...classSummary].map(([name, item]) => <tr key={name}><td><strong>{name}</strong></td><td>{item.sakit}</td><td>{item.izin}</td><td>{item.alpa}</td><td>{item.dinas}</td><td><strong>{item.total}</strong></td></tr>)}{!classSummary.size && <tr><td colSpan={6} className="empty-state">Belum ada data.</td></tr>}</tbody></table></div></article><article className="panel"><div className="panel-header"><div><h2>Jejak audit</h2><p>20 aktivitas terbaru</p></div></div><div className="audit-list">{audit.map((item) => <div className="audit-item" key={item.id}><span className="audit-dot" /><div><strong>{item.description}</strong><small>{item.user || "Sistem"} · {formatDateTimeId(item.createdAt)}</small></div><StatusPill>{item.action}</StatusPill></div>)}{!audit.length && <p className="empty-state">Belum ada aktivitas.</p>}</div></article></section></>;
}
