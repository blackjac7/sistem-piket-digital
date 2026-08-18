import { and, eq } from "drizzle-orm";
import { CalendarClock } from "lucide-react";
import { createScheduleAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { ScheduleBoard } from "@/components/schedule-board";
import { db } from "@/db";
import { dutySchedules, teachers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { weekdayNames } from "@/lib/utils";

export default async function SchedulePage() {
  await requireAdmin();
  const [dutyTeachers, schedules] = await Promise.all([
    db.select({ id: teachers.id, name: teachers.name }).from(teachers).where(and(eq(teachers.isDutyTeacher, true), eq(teachers.isActive, true))).orderBy(teachers.name),
    db.select({ id: dutySchedules.id, teacher: teachers.name, weekday: dutySchedules.weekday, shift: dutySchedules.shift, start: dutySchedules.startTime, end: dutySchedules.endTime }).from(dutySchedules).innerJoin(teachers, eq(dutySchedules.teacherId, teachers.id)).where(and(eq(dutySchedules.isActive, true), eq(teachers.isActive, true))).orderBy(dutySchedules.weekday, dutySchedules.startTime),
  ]);
  return <>
    <PageHeader title="Jadwal guru piket" description="Atur penugasan lima guru piket berdasarkan hari dan shift." />
    <section className="split-layout compact-form"><article className="panel form-panel"><div className="panel-header"><div><h2><CalendarClock /> Tambah jadwal</h2><p>Guru harus berstatus guru piket</p></div></div><ActionForm action={createScheduleAction} submitLabel="Simpan jadwal">
      <label className="field"><span>Guru piket</span><select name="teacherId" required><option value="">Pilih guru</option>{dutyTeachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="form-grid two"><label className="field"><span>Hari</span><select name="weekday">{Object.entries(weekdayNames).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label className="field"><span>Shift</span><select name="shift"><option value="PAGI">Pagi</option><option value="SIANG">Siang</option></select></label></div><div className="form-grid two"><label className="field"><span>Mulai</span><input type="time" name="startTime" defaultValue="06:30" /></label><label className="field"><span>Selesai</span><input type="time" name="endTime" defaultValue="14:00" /></label></div>
    </ActionForm></article><article className="panel data-panel"><div className="panel-header"><div><h2>Jadwal mingguan</h2><p>{schedules.length} penugasan aktif</p></div></div><ScheduleBoard key={schedules.map((item) => `${item.id}:${item.weekday}`).join("|")} schedules={schedules} days={Object.entries(weekdayNames).map(([value, label]) => ({ value: Number(value), label }))} /></article></section>
  </>;
}
