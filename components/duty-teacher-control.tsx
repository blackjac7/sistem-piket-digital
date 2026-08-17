"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { BadgeCheck, Check, Copy, KeyRound, LoaderCircle, Pencil, UserMinus, X } from "lucide-react";
import { removeDutyTeacherAction, setDutyTeacherAction } from "@/app/actions";
import { AppDialog } from "./app-dialog";
import { MutationRequestInput } from "./mutation-request-input";

function AssignmentSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="button button-primary" type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" aria-hidden="true" />} {pending ? "Menyimpan..." : "Simpan penetapan"}</button>;
}

function RemoveSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="button button-danger" type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" aria-hidden="true" />} {pending ? "Melepas..." : "Ya, lepas guru piket"}</button>;
}

export function DutyTeacherControl({ teacherId, teacherName, isDutyTeacher, username, suggestedUsername }: { teacherId: number; teacherName: string; isDutyTeacher: boolean; username: string | null; suggestedUsername: string }) {
  const [assignState, assignAction] = useActionState(setDutyTeacherAction, {});
  const [removeState, removeAction] = useActionState(removeDutyTeacherAction, {});
  const [assignOpen, setAssignOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyTemporaryPassword() {
    if (!assignState.temporaryPassword) return;
    await navigator.clipboard.writeText(assignState.temporaryPassword);
    setCopied(true);
  }

  function finishAssignment() {
    window.dispatchEvent(new CustomEvent("app-loading-start", { detail: { label: "Memuat data guru piket" } }));
    window.location.reload();
  }

  return <>
    {isDutyTeacher ? <>
      <button className="button button-secondary small" type="button" onClick={() => { setAssignOpen(true); setCopied(false); }}><Pencil aria-hidden="true" /> Username</button>
      <button className="button button-secondary small" type="button" onClick={() => setRemoveOpen(true)}><UserMinus aria-hidden="true" /> Lepas</button>
    </> : <button className="button button-secondary small" type="button" onClick={() => { setAssignOpen(true); setCopied(false); }}><BadgeCheck aria-hidden="true" /> Jadikan piket</button>}

    <AppDialog open={assignOpen} onClose={() => { if (!assignState.success) setAssignOpen(false); }} title={assignState.temporaryPassword ? "Akun guru piket siap" : assignState.success ? "Perubahan tersimpan" : isDutyTeacher ? `Ubah username ${teacherName}` : `Tetapkan ${teacherName}`} description={assignState.temporaryPassword ? `Simpan password sementara ini dan sampaikan secara pribadi kepada ${assignState.accountName || teacherName}.` : assignState.success ? "Data guru piket dan akses akunnya sudah diperbarui." : "Username disimpan huruf kecil dan harus unik di seluruh akun."} tone={assignState.success ? "success" : "neutral"} dismissible={!assignState.success}>
      {assignState.temporaryPassword ? <div className="temporary-password" role="status">
        <strong>Akun baru untuk {assignState.accountName || teacherName}</strong>
        <code>{assignState.temporaryPassword}</code>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={copyTemporaryPassword}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? "Tersalin" : "Salin password"}</button>
          <button className="button button-primary" type="button" onClick={finishAssignment}><KeyRound aria-hidden="true" /> Selesai</button>
        </div>
        <small>Password sementara hanya ditampilkan sekali. Guru wajib menggantinya saat login pertama.</small>
      </div> : assignState.success ? <div className="dialog-result" role="status"><p className="dialog-message">{assignState.success}</p><div className="dialog-actions"><button className="button button-primary" type="button" onClick={finishAssignment}><Check aria-hidden="true" /> Selesai</button></div></div> : <form action={assignAction} className="form-stack">
        <MutationRequestInput resetKey={assignState} />
        <input type="hidden" name="teacherId" value={teacherId} />
        <label className="field"><span>Username guru piket</span><input name="username" defaultValue={username || suggestedUsername} minLength={3} maxLength={60} pattern="[a-z0-9._-]{3,60}" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-dialog-autofocus required /></label>
        <p className="helper-text">Saran otomatis: <span className="mono">{suggestedUsername}</span>. Admin dapat menggantinya, tetapi username wajib unik.</p>
        {assignState.error && <p className="form-message error" role="alert">{assignState.error}</p>}
        <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => setAssignOpen(false)}><X aria-hidden="true" /> Batal</button><AssignmentSubmitButton /></div>
      </form>}
    </AppDialog>

    <AppDialog open={removeOpen} onClose={() => { if (!removeState.success) setRemoveOpen(false); }} title={removeState.success ? "Status guru piket diperbarui" : `Lepas ${teacherName} dari guru piket?`} description={removeState.success ? "Akses operasional dan jadwal aktif sudah dinonaktifkan tanpa menghapus histori." : "Akun operasional akan dinonaktifkan dan jadwal aktif ditutup. Histori absensi tetap tersimpan."} tone={removeState.success ? "success" : "danger"} dismissible={!removeState.success}>
      {removeState.success ? <div className="dialog-result" role="status"><p className="dialog-message">{removeState.success}</p><div className="dialog-actions"><button className="button button-primary" type="button" onClick={finishAssignment}><Check aria-hidden="true" /> Selesai</button></div></div> : <form action={removeAction} className="reset-confirm">
        <MutationRequestInput resetKey={removeState} />
        <input type="hidden" name="teacherId" value={teacherId} />
        <p>Guru ini tidak dapat login sebagai guru piket sampai ditetapkan kembali oleh Admin.</p>
        {removeState.error && <p className="form-message error" role="alert">{removeState.error}</p>}
        <div className="dialog-actions"><button className="button button-secondary" type="button" data-dialog-autofocus onClick={() => setRemoveOpen(false)}><X aria-hidden="true" /> Batal</button><RemoveSubmitButton /></div>
      </form>}
    </AppDialog>
  </>;
}
