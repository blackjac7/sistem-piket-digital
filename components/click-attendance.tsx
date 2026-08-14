"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, GraduationCap, Info, Stethoscope, UserRound, UsersRound, XCircle } from "lucide-react";
import { createAttendanceAction, type ActionState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { cn, jakartaDate } from "@/lib/utils";
import { attendanceStatuses } from "@/lib/site-config";

type Student = { id: number; name: string; classId: number };
type Teacher = { id: number; name: string; subject: string | null };
type SchoolClass = { id: number; name: string };

const statusIcons = { SAKIT: Stethoscope, IZIN: Info, ALPA: XCircle, DINAS: CheckCircle2 } as const;

export function ClickAttendance({ classes, students, teachers }: { classes: SchoolClass[]; students: Student[]; teachers: Teacher[] }) {
  const [type, setType] = useState<"SISWA" | "GURU">("SISWA");
  const [classId, setClassId] = useState(classes[0]?.id || 0);
  const [personId, setPersonId] = useState<number | null>(null);
  const [status, setStatus] = useState<(typeof attendanceStatuses)[number]["value"]>("SAKIT");
  const [showNotes, setShowNotes] = useState(false);
  const [state, action] = useActionState(async (previousState: ActionState, formData: FormData) => {
    const result = await createAttendanceAction(previousState, formData);
    if (result.success) { setPersonId(null); setShowNotes(false); }
    return result;
  }, {});
  const visibleStudents = useMemo(() => students.filter((student) => student.classId === classId), [students, classId]);

  function changeType(next: "SISWA" | "GURU") { setType(next); setPersonId(null); setStatus(next === "GURU" ? "DINAS" : "SAKIT"); }

  return <form action={action} className="click-attendance-form">
    <input type="hidden" name="type" value={type} /><input type="hidden" name="studentId" value={type === "SISWA" ? personId || "" : ""} /><input type="hidden" name="teacherId" value={type === "GURU" ? personId || "" : ""} /><input type="hidden" name="status" value={status} /><input type="hidden" name="attendanceDate" value={jakartaDate()} />
    <div className="attendance-mode" role="group" aria-label="Jenis absensi"><button type="button" aria-pressed={type === "SISWA"} className={cn(type === "SISWA" && "active")} onClick={() => changeType("SISWA")}><GraduationCap aria-hidden="true" /><span><strong>Absensi siswa</strong><small>Pilih kelas dan nama siswa</small></span></button><button type="button" aria-pressed={type === "GURU"} className={cn(type === "GURU" && "active")} onClick={() => changeType("GURU")}><UsersRound aria-hidden="true" /><span><strong>Absensi guru</strong><small>Pilih langsung nama guru</small></span></button></div>
    {type === "SISWA" && <section className="click-step"><header><span>1</span><div><strong>Pilih kelas</strong><small>{classes.length} kelas tersedia</small></div></header><div className="class-chips" role="group" aria-label="Pilih kelas">{classes.map((item) => <button type="button" aria-pressed={classId === item.id} key={item.id} className={cn(classId === item.id && "active")} onClick={() => { setClassId(item.id); setPersonId(null); }}>{item.name}</button>)}</div></section>}
    <section className="click-step"><header><span>{type === "SISWA" ? "2" : "1"}</span><div><strong>Pilih {type === "SISWA" ? "siswa" : "guru"}</strong><small>{type === "SISWA" ? `${visibleStudents.length} siswa di kelas terpilih` : `${teachers.length} guru aktif`}</small></div></header><div className="person-picker" role="group" aria-label={`Pilih ${type === "SISWA" ? "siswa" : "guru"}`}>{(type === "SISWA" ? visibleStudents : teachers).map((person) => <button type="button" aria-pressed={personId === person.id} key={person.id} className={cn(personId === person.id && "active")} onClick={() => setPersonId(person.id)}><span className="avatar" aria-hidden="true">{person.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><strong>{person.name}</strong>{"subject" in person && <small>{person.subject || "Guru SMP IP YAKIN"}</small>}</span>{personId === person.id && <CheckCircle2 aria-hidden="true" />}</button>)}{type === "SISWA" && !visibleStudents.length && <div className="roster-empty"><UserRound aria-hidden="true" /><strong>Daftar siswa kelas ini belum diisi</strong><small>Minta Admin IT mengisi menu Data siswa terlebih dahulu.</small></div>}</div></section>
    <section className="click-step"><header><span>{type === "SISWA" ? "3" : "2"}</span><div><strong>Pilih status</strong><small>Satu klik untuk menentukan alasan</small></div></header><div className="status-picker" role="group" aria-label="Pilih status">{attendanceStatuses.filter((item) => type === "GURU" || item.value !== "DINAS").map(({ value, label, tone }) => { const Icon = statusIcons[value]; return <button type="button" aria-pressed={status === value} key={value} className={cn(tone, status === value && "active")} onClick={() => setStatus(value)}><Icon aria-hidden="true" /><strong>{label}</strong></button>; })}</div></section>
    <section className="optional-area"><div><strong>Keterangan tambahan</strong><small>Opsional, boleh dikosongkan</small></div><button type="button" aria-expanded={showNotes} className="button button-secondary small" onClick={() => setShowNotes((value) => !value)}>{showNotes ? "Tutup" : "Tambah keterangan"}</button>{showNotes && <textarea name="notes" aria-label="Keterangan tambahan" rows={2} placeholder="Tulis keterangan bila diperlukan..." />}<label className="checkbox-field"><input name="isConfirmed" type="checkbox" /><span><strong>Sudah dikonfirmasi</strong><small>Centang hanya jika sudah ada konfirmasi.</small></span></label></section>
    <div aria-live="polite">{state.error && <p className="form-message error" role="alert">{state.error}</p>}{state.success && <p className="form-message success" role="status">{state.success}</p>}</div>
    <SubmitButton className="attendance-submit" disabled={!personId}>{personId ? "Simpan absensi" : `Pilih ${type === "SISWA" ? "siswa" : "guru"} terlebih dahulu`}</SubmitButton>
  </form>;
}
