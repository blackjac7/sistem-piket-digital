"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";
import { confirmAttendanceAction, updateAttendanceStatusAction, type ActionState } from "@/app/actions";
import { attendanceStatuses } from "@/lib/site-config";
import { AppDialog } from "./app-dialog";
import { ConfirmFormButton } from "./confirm-form-button";
import { MutationRequestInput } from "./mutation-request-input";
import { SubmitButton } from "./submit-button";

type AttendanceStatus = (typeof attendanceStatuses)[number]["value"];
type AttendanceType = "SISWA" | "GURU";

export function AttendanceRecordActions({ id, name, type, status, confirmed }: { id: number; name: string; type: AttendanceType; status: AttendanceStatus; confirmed: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmState, confirmAction] = useActionState(confirmAttendanceAction, {});
  const [updateState, updateAction] = useActionState(async (previousState: ActionState, formData: FormData) => {
    const result = await updateAttendanceStatusAction(previousState, formData);
    if (result.success) setEditOpen(false);
    return result;
  }, {});

  if (confirmed) return null;

  return <>
    <div className="attendance-record-actions">
      <form action={confirmAction}>
        <MutationRequestInput resetKey={confirmState} />
        <input type="hidden" name="id" value={id} />
        <ConfirmFormButton
          label="Konfirmasi"
          options={{
            title: "Konfirmasi catatan absensi?",
            description: "Setelah dikonfirmasi, status catatan tidak dapat diubah lagi.",
            message: `Pastikan status ${name} sudah benar sebelum mengunci catatan ini.`,
            confirmLabel: "Ya, konfirmasi",
          }}
        />
      </form>
      <button className="button button-secondary small" type="button" onClick={() => setEditOpen(true)}><Pencil aria-hidden="true" /> Ubah status</button>
      {confirmState.error && <p className="form-message error attendance-action-message" role="alert">{confirmState.error}</p>}
    </div>
    <AppDialog open={editOpen} onClose={() => setEditOpen(false)} title={`Ubah status ${name}`} description="Status hanya dapat diubah selama catatan belum dikonfirmasi." tone="neutral">
      <form action={updateAction} className="form-stack">
        <MutationRequestInput resetKey={updateState} />
        <input type="hidden" name="id" value={id} />
        <label className="field"><span>Status absensi</span><select name="status" defaultValue={status} data-dialog-autofocus required>{attendanceStatuses.filter((item) => type === "GURU" || item.value !== "DINAS").map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        {updateState.error && <p className="form-message error" role="alert">{updateState.error}</p>}
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={() => setEditOpen(false)}><X aria-hidden="true" /> Batal</button>
          <SubmitButton pendingLabel="Menyimpan...">Simpan status</SubmitButton>
        </div>
      </form>
    </AppDialog>
  </>;
}
