import { eq } from "drizzle-orm";
import { CalendarClock, Trash2 } from "lucide-react";
import { createScheduleAction, deleteScheduleAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { db } from "@/db";
import { dutySchedules, teachers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { weekdayNames } from "@/lib/utils";

export default async function SchedulePage() {
  await requireAdmin();
  const [dutyTeachers, schedules] = await Promise.all([
    db.select({ id: teachers.id, name: teachers.name }).from(teachers).where(eq(teachers.isDutyTeacher, true)).orderBy(teachers.name),
    db.select({ id: dutySchedules.id, teacher: teachers.name, weekday: dutySchedules.weekday, shift: dutySchedules.shift, start: dutySchedules.startTime, end: dutySchedules.endTime }).from(dutySchedules).innerJoin(teachers, eq(dutySchedules.teacherId, teachers.id)).orderBy(dutySchedules.weekday, dutySchedules.startTime),
  ]);
  return <>
    <PageHeader title="Jadwal guru piket" description="Atur penugasan lima guru piket berdasarkan hari dan shift." />
    <section className="split-layout compact-form"><article className="panel form-panel"><div className="panel-header"><div><h2><CalendarClock /> Tambah jadwal</h2><p>Guru harus berstatus guru piket</p></div></div><ActionForm action={createScheduleAction} submitLabel="Simpan jadwal">
      <label className="field"><span>Guru piket</span><select name="teacherId" required><option value="">Pilih guru</option>{dutyTeachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="form-grid two"><label className="field"><span>Hari</span><select name="weekday">{Object.entries(weekdayNames).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label className="field"><span>Shift</span><select name="shift"><option value="PAGI">Pagi</option><option value="SIANG">Siang</option></select></label></div><div className="form-grid two"><label className="field"><span>Mulai</span><input type="time" name="startTime" defaultValue="06:30" /></label><label className="field"><span>Selesai</span><input type="time" name="endTime" defaultValue="14:00" /></label></div>
    </ActionForm></article><article className="panel data-panel"><div className="panel-header"><div><h2>Jadwal mingguan</h2><p>{schedules.length} penugasan aktif</p></div></div><div className="schedule-board">{Object.entries(weekdayNames).map(([day, label]) => { const items = schedules.filter((item) => item.weekday === Number(day)); return <section className="schedule-day" key={day}><header><strong>{label}</strong><span>{items.length} petugas</span></header>{items.map((item) => <div className="schedule-entry" key={item.id}><span className="avatar">{item.teacher.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><strong>{item.teacher}</strong><small>{item.start.slice(0, 5)}–{item.end.slice(0, 5)}</small></div><StatusPill tone="info">{item.shift}</StatusPill><form action={deleteScheduleAction}><input type="hidden" name="id" value={item.id} /><button className="icon-button danger"><Trash2 /></button></form></div>)}{!items.length && <p className="day-empty">Belum ada petugas</p>}</section>; })}</div></article></section>
  </>;
}
