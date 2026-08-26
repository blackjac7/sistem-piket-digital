"use client";

import { useActionState, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { createSchoolCalendarAction, type ActionState } from "@/app/actions";
import { weekdayNames } from "@/lib/utils";
import { MutationRequestInput } from "./mutation-request-input";
import { SubmitButton } from "./submit-button";

export function SchoolCalendarForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState("LIBUR");
  const [state, action] = useActionState(async (previous: ActionState, formData: FormData) => {
    const result = await createSchoolCalendarAction(previous, formData);
    if (result.success) {
      formRef.current?.reset();
      setStatus("LIBUR");
    }
    return result;
  }, {});

  return <form action={action} ref={formRef} className="form-stack">
    <MutationRequestInput resetKey={state} />
    <label className="field"><span>Nama agenda</span><input name="title" required maxLength={160} placeholder="Contoh: Libur Idulfitri" /></label>
    <div className="form-grid two"><label className="field"><span>Mulai</span><input name="startDate" type="date" required /></label><label className="field"><span>Selesai</span><input name="endDate" type="date" required /></label></div>
    <label className="field"><span>Status operasional</span><select name="status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="LIBUR">Libur sekolah</option><option value="TUTUP_DARURAT">Tutup darurat</option><option value="KEGIATAN_KHUSUS">Kegiatan khusus</option><option value="HARI_PENGGANTI">Hari pengganti</option></select></label>
    {status === "HARI_PENGGANTI" && <label className="field"><span>Gunakan jadwal hari</span><select name="scheduleWeekday" required defaultValue=""><option value="">Pilih hari jadwal</option>{Object.entries(weekdayNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><small className="helper-text">Jadwal reguler hari ini akan digunakan pada tanggal pengganti.</small></label>}
    <label className="field"><span>Keterangan <small>(opsional)</small></span><textarea name="description" rows={3} maxLength={1000} placeholder="Sumber keputusan atau informasi tambahan" /></label>
    <label className="checkbox-field"><input name="isPublished" type="checkbox" defaultChecked /><span><strong>Publikasikan sekarang</strong><small>Draf tidak mengubah kewajiban piket sampai dipublikasikan.</small></span></label>
    {state.error && <p className="form-message error" role="alert">{state.error}</p>}
    {state.success && <p className="form-message success" role="status">{state.success}</p>}
    <SubmitButton><CalendarPlus aria-hidden="true" /> Simpan kalender</SubmitButton>
  </form>;
}
