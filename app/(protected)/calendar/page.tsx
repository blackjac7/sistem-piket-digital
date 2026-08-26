import { asc, eq } from "drizzle-orm";
import { CalendarDays, FileText, Send } from "lucide-react";
import { archiveSchoolCalendarAction, publishSchoolCalendarAction } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MutationRequestInput } from "@/components/mutation-request-input";
import { PageHeader } from "@/components/page-header";
import { SchoolCalendarForm } from "@/components/school-calendar-form";
import { StatusPill } from "@/components/status-pill";
import { db } from "@/db";
import { schoolCalendar } from "@/db/schema";
import { requireRoles } from "@/lib/auth";
import { calendarStatusMeta, formatCalendarRange } from "@/lib/school-calendar";
import { formatDateId, weekdayNames } from "@/lib/utils";

export default async function CalendarPage() {
  await requireRoles(["ADMIN", "WAKASEK_KURIKULUM"]);
  const entries = await db.select({
    id: schoolCalendar.id,
    startDate: schoolCalendar.startDate,
    endDate: schoolCalendar.endDate,
    status: schoolCalendar.status,
    title: schoolCalendar.title,
    description: schoolCalendar.description,
    scheduleWeekday: schoolCalendar.scheduleWeekday,
    isPublished: schoolCalendar.isPublished,
    createdAt: schoolCalendar.createdAt,
  }).from(schoolCalendar).where(eq(schoolCalendar.isActive, true)).orderBy(asc(schoolCalendar.startDate), asc(schoolCalendar.id));

  return <>
    <PageHeader title="Kalender sekolah" description="Atur hari libur dan pengecualian operasional tanpa mengubah jadwal piket mingguan." action={<span className="page-header-badge"><CalendarDays aria-hidden="true" /> {entries.length} agenda aktif</span>} />
    <section className="calendar-guidance" aria-label="Aturan kalender"><CalendarDays aria-hidden="true" /><div><strong>Kalender yang dipublikasikan menjadi acuan sistem</strong><p>Libur dan tutup darurat mengecualikan piket dari pemantauan. Kegiatan khusus dan hari pengganti tetap dihitung sebagai hari operasional.</p></div></section>
    <section className="split-layout compact-form calendar-layout">
      <article className="panel form-panel"><div className="panel-header"><div><h2><CalendarPlusIcon /> Tambah agenda</h2><p>Simpan sebagai draf atau publikasikan langsung.</p></div></div><SchoolCalendarForm /></article>
      <article className="panel data-panel"><div className="panel-header"><div><h2><FileText aria-hidden="true" /> Agenda kalender</h2><p>Riwayat aktif tidak dihapus saat diarsipkan.</p></div></div><div className="calendar-list">
        {entries.map((entry) => { const meta = calendarStatusMeta(entry.status); return <article className={`calendar-entry${entry.isPublished ? " published" : " draft"}`} key={entry.id}>
          <div className="calendar-entry-main"><div className="calendar-entry-title"><strong>{entry.title}</strong><StatusPill tone={entry.isPublished ? (meta.nonOperational ? "warning" : "info") : "neutral"}>{entry.isPublished ? meta.label : "Draf"}</StatusPill></div><p>{formatCalendarRange(entry.startDate, entry.endDate)}{entry.scheduleWeekday ? ` · memakai jadwal ${weekdayNames[entry.scheduleWeekday]}` : ""}</p>{entry.description && <small>{entry.description}</small>}<small className="calendar-entry-meta">Dibuat {formatDateId(entry.createdAt)}</small></div>
          <div className="calendar-entry-actions">{!entry.isPublished && <form action={publishSchoolCalendarAction}><MutationRequestInput /><input type="hidden" name="id" value={entry.id} /><button className="button button-secondary small" type="submit"><Send aria-hidden="true" /> Publikasikan</button></form>}<form action={archiveSchoolCalendarAction}><MutationRequestInput /><input type="hidden" name="id" value={entry.id} /><ConfirmSubmitButton icon="archive" label="Arsipkan" title="Arsipkan agenda kalender?" description="Agenda tidak akan digunakan lagi, tetapi riwayat audit tetap tersimpan." message={`Arsipkan agenda ${entry.title}?`} confirmLabel="Arsipkan agenda" /></form></div>
        </article>; })}
        {!entries.length && <div className="empty-block"><CalendarDays aria-hidden="true" /><p>Belum ada agenda kalender.</p><small>Tambahkan tanggal merah atau pengecualian operasional di panel sebelah.</small></div>}
      </div></article>
    </section>
  </>;
}

function CalendarPlusIcon() {
  return <CalendarDays aria-hidden="true" />;
}
