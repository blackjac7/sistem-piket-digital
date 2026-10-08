import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { CalendarDays, Info } from "lucide-react";
import { deleteAttendanceAction } from "@/app/actions";
import { AttendanceRecordActions } from "@/components/attendance-record-actions";
import { ClickAttendance, type AttendanceDateOption } from "@/components/click-attendance";
import { ConfirmAllAttendance } from "@/components/confirm-all-attendance";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MutationRequestInput } from "@/components/mutation-request-input";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { db } from "@/db";
import { attendanceRecords, schoolClasses, students, teachers, users } from "@/db/schema";
import { formatDateId, formatDateTimeId, jakartaDate } from "@/lib/utils";
import { requireRoles } from "@/lib/auth";
import { DUTY_FILL_WINDOW_DAYS, getOpenDutyWindowsForTeacher, openWindowsForDisplay } from "@/lib/duty-access";
import { findCalendarEntryForDate, getPublishedCalendarEntries, getPublishedCalendarEntry, isOperationalSchoolDate } from "@/lib/school-calendar";

export default async function AttendancePage() {
  const user = await requireRoles(["ADMIN", "GURU_PIKET"]);
  const today = jakartaDate();
  const todayCalendar = await getPublishedCalendarEntry(today);
  const operationalToday = isOperationalSchoolDate(today, todayCalendar);
  const [classes, studentList, teacherList, records, pendingRows] = await Promise.all([
    db.select({ id: schoolClasses.id, name: schoolClasses.name }).from(schoolClasses).where(eq(schoolClasses.isActive, true)).orderBy(schoolClasses.grade, schoolClasses.name),
    db.select({ id: students.id, name: students.name, classId: students.classId }).from(students).where(and(eq(students.isActive, true), isNotNull(students.classId))).orderBy(students.name),
    db.select({ id: teachers.id, name: teachers.name, subject: teachers.subject }).from(teachers).where(eq(teachers.isActive, true)).orderBy(teachers.name),
    db.select({ id: attendanceRecords.id, name: attendanceRecords.personName, type: attendanceRecords.type, className: schoolClasses.name, status: attendanceRecords.status, date: attendanceRecords.attendanceDate, notes: attendanceRecords.notes, confirmed: attendanceRecords.isConfirmed, recorder: users.name, createdAt: attendanceRecords.createdAt }).from(attendanceRecords).leftJoin(schoolClasses, eq(attendanceRecords.classId, schoolClasses.id)).innerJoin(users, eq(attendanceRecords.recordedBy, users.id)).orderBy(desc(attendanceRecords.attendanceDate), desc(attendanceRecords.createdAt)).limit(100),
    db.select({ value: count() }).from(attendanceRecords).where(eq(attendanceRecords.isConfirmed, false)),
  ]);
  const pendingCount = pendingRows[0]?.value || 0;
  const calendarEntries = records.length ? await getPublishedCalendarEntries(records[records.length - 1].date, records[0].date) : [];
  const calendarForRecord = (date: string) => findCalendarEntryForDate(date, calendarEntries);

  // Daftar tanggal yang boleh diisi oleh akun ini.
  let dateOptions: AttendanceDateOption[] = [];
  let scopeNote: string | undefined;
  let emptyNote: string | undefined;
  if (user.role === "ADMIN") {
    dateOptions = [{ value: today, label: formatDateId(today), hint: "Hari ini" }];
    scopeNote = "Admin IT dapat mengoreksi tanggal kapan pun melalui riwayat";
  } else if (user.teacherId) {
    const windows = openWindowsForDisplay(await getOpenDutyWindowsForTeacher(user.teacherId, today), { includeCompleted: true });
    dateOptions = windows.map((window) => ({
      value: window.dutyDate,
      label: formatDateId(window.dutyDate),
      hint: window.dutyDate === today
        ? `Hari ini · ${window.weekdayLabel}`
        : window.remainingDays === 0
          ? `Hari terakhir · ${window.weekdayLabel}`
          : `Sisa ${window.remainingDays} hari · ${window.weekdayLabel}${window.completed ? " · tugas selesai" : ""}`,
    }));
    scopeNote = `Hanya jadwal piket Anda. Pengisian susulan dibuka ${DUTY_FILL_WINDOW_DAYS} hari setelah tanggal jadwal`;
    emptyNote = "Belum ada jadwal piket aktif pada akun Anda. Hubungi Admin IT.";
  } else {
    emptyNote = "Akun Anda belum terhubung ke data guru piket. Hubungi Admin IT.";
  }
  const formAvailable = dateOptions.length > 0;

  return <>
    <PageHeader title="Absensi sekolah" description="Catat ketidakhadiran siswa dan guru secara terpusat." />
    {!operationalToday && <section className="calendar-guidance dashboard-calendar-notice" aria-label="Absensi hari ini tidak diperlukan"><CalendarDays aria-hidden="true" /><div><strong>{todayCalendar?.title || "Bukan hari operasional sekolah"}</strong><p>{todayCalendar?.description || "Hari ini tidak perlu mencatat absensi. Anda tetap dapat mengisi absensi susulan untuk tanggal jadwal yang masih terbuka."}</p></div><StatusPill tone="warning">Hari ini libur</StatusPill></section>}
    <section className="split-layout">
      <article className="panel click-panel">
        <div className="panel-header"><div><h2>Absensi cepat</h2><p>{formAvailable ? (user.role === "GURU_PIKET" ? "Sesuai jadwal piket akun Anda" : "Untuk tanggal hari ini") : "Tidak ada tanggal yang dapat diisi"}</p></div></div>
        {formAvailable ? <ClickAttendance classes={classes} students={studentList.map((item) => ({ ...item, classId: item.classId! }))} teachers={teacherList} dates={dateOptions} defaultDate={today} scopeNote={scopeNote} emptyNote={emptyNote} /> : <div className="empty-block calendar-closed-block"><CalendarDays aria-hidden="true" /><p>Form absensi belum dapat digunakan.</p><small>{emptyNote || "Hubungi Admin IT untuk melengkapi jadwal piket Anda."}</small></div>}
      </article>
      <article className="panel data-panel">
        <div className="panel-header"><div><h2>Riwayat absensi</h2><p>{user.role === "GURU_PIKET" ? `Catatan “Belum” pada jadwal Anda dapat dikoreksi maksimal ${DUTY_FILL_WINDOW_DAYS} hari` : "Catatan “Belum” dapat dikoreksi atau dikonfirmasi"}</p></div><ConfirmAllAttendance pendingCount={pendingCount} /></div>
        {user.role === "GURU_PIKET" && <p className="history-note"><Info aria-hidden="true" /> Anda hanya dapat mengubah catatan absensi pada tanggal jadwal piket Anda, maksimal {DUTY_FILL_WINDOW_DAYS} hari setelahnya. Warna biru menandai tanggal jadwal Anda.</p>}
        <div className="mobile-data-view"><div className="mobile-record-list">{records.map((item) => { const calendar = calendarForRecord(item.date); const excluded = !isOperationalSchoolDate(item.date, calendar); const editable = user.role === "ADMIN" ? !item.confirmed : !item.confirmed && dateOptions.some((option) => option.value === item.date); return <article className={`mobile-record${editable ? " own-duty" : ""}`} key={item.id}>
          <div className="mobile-record-heading"><span className="avatar">{item.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{item.name}</strong><small>{item.type === "SISWA" ? `Siswa · ${item.className || "Tanpa kelas"}` : "Guru"}</small></span>{excluded ? <StatusPill tone="neutral">Dikecualikan</StatusPill> : <StatusPill tone={item.status === "ALPA" ? "danger" : item.status === "SAKIT" ? "warning" : "info"}>{item.status}</StatusPill>}</div>
          <dl className="mobile-record-details"><div><dt>Tanggal</dt><dd>{formatDateId(item.date)}</dd></div><div><dt>Konfirmasi</dt><dd>{item.confirmed ? "Sudah" : "Belum"}</dd></div></dl>
          <p className="mobile-record-note">{excluded ? `${calendar?.title || "Bukan hari operasional sekolah"} · Tidak masuk laporan operasional` : item.notes || "Tanpa keterangan"} · Dicatat {item.recorder} pada {formatDateTimeId(item.createdAt)}</p>
          <div className="mobile-record-actions">{editable ? <><AttendanceRecordActions id={item.id} name={item.name} type={item.type} status={item.status} confirmed={item.confirmed} /><form action={deleteAttendanceAction}><MutationRequestInput /><input type="hidden" name="id" value={item.id} /><ConfirmSubmitButton message={`Hapus catatan ${item.name}? Tindakan ini tidak dapat dibatalkan.`} /></form></> : <StatusPill tone={item.confirmed ? "success" : "neutral"}>{item.confirmed ? "Sudah dikunci" : "Di luar jadwal Anda"}</StatusPill>}</div>
        </article>; })}{!records.length && <p className="empty-state">Belum ada data absensi.</p>}</div></div>
        <div className="table-scroll desktop-data-view"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Status</th><th>Tanggal</th><th>Konfirmasi</th><th>Pencatat</th><th /></tr></thead><tbody>
          {records.map((item) => { const calendar = calendarForRecord(item.date); const excluded = !isOperationalSchoolDate(item.date, calendar); const editable = user.role === "ADMIN" ? !item.confirmed : !item.confirmed && dateOptions.some((option) => option.value === item.date); const isOwnDutyDate = dateOptions.some((option) => option.value === item.date); return <tr key={item.id} className={user.role === "GURU_PIKET" && isOwnDutyDate ? "own-duty-row" : undefined}><td><strong>{item.name}</strong><small className="table-subtitle">{item.type === "SISWA" ? "Siswa" : "Guru"} · {excluded ? `${calendar?.title || "Bukan hari operasional sekolah"} (dikecualikan)` : item.notes || "Tanpa keterangan"}</small></td><td>{item.className || "Guru"}</td><td>{excluded ? <StatusPill tone="neutral">Dikecualikan</StatusPill> : <StatusPill tone={item.status === "ALPA" ? "danger" : item.status === "SAKIT" ? "warning" : "info"}>{item.status}</StatusPill>}</td><td>{formatDateId(item.date)}<small className="table-subtitle mono">{formatDateTimeId(item.createdAt)}</small></td><td>{item.confirmed ? <StatusPill tone="success">Sudah</StatusPill> : <StatusPill tone="warning">Belum</StatusPill>}</td><td>{item.recorder}</td><td>{editable ? <div className="table-actions"><AttendanceRecordActions id={item.id} name={item.name} type={item.type} status={item.status} confirmed={item.confirmed} /><form action={deleteAttendanceAction}><MutationRequestInput /><input type="hidden" name="id" value={item.id} /><ConfirmSubmitButton message={`Hapus catatan ${item.name}? Tindakan ini tidak dapat dibatalkan.`} /></form></div> : <StatusPill tone={item.confirmed ? "success" : "neutral"}>{item.confirmed ? "Sudah dikunci" : "Di luar jadwal"}</StatusPill>}</td></tr>; })}
          {!records.length && <tr><td colSpan={7} className="empty-state">Belum ada data absensi.</td></tr>}
        </tbody></table></div>
      </article>
    </section>
  </>;
}
