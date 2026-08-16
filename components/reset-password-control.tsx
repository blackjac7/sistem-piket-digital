"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { resetUserPasswordAction } from "@/app/actions";
import { AppDialog } from "./app-dialog";

function ResetSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="button button-primary small" type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} {pending ? "Mereset..." : "Ya, reset akun"}</button>;
}

export function ResetPasswordControl({ userId, accountName }: { userId: number; accountName: string }) {
  const [state, action] = useActionState(resetUserPasswordAction, {});
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  async function copyTemporaryPassword() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(state.temporaryPassword!);
      setCopied(true);
    } finally {
      setCopying(false);
    }
  }

  function finishReset() {
    setReloading(true);
    window.dispatchEvent(new CustomEvent("app-loading-start", { detail: { label: "Memuat ulang data akun" } }));
    window.location.reload();
  }

  return (
    <>
      <button className="button button-secondary small" type="button" onClick={() => { setOpen(true); setDismissed(false); setCopied(false); setCopying(false); setReloading(false); }}><KeyRound /> Reset password</button>
      <AppDialog open={open} onClose={() => { if (!state.temporaryPassword) setOpen(false); }} title={state.temporaryPassword && !dismissed ? "Password sementara siap" : `Reset password ${accountName}?`} description={state.temporaryPassword && !dismissed ? `Kirim password ini secara pribadi kepada ${state.accountName}.` : "Semua sesi akun akan dikeluarkan dan pengguna wajib membuat password baru saat login berikutnya."} tone={state.temporaryPassword && !dismissed ? "success" : "danger"} dismissible={!state.temporaryPassword}>
        {state.temporaryPassword && !dismissed ? <div className="temporary-password" role="status">
          <strong>Password sementara untuk @{state.accountName}</strong>
          <code>{state.temporaryPassword}</code>
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={copyTemporaryPassword} disabled={copying || reloading} aria-busy={copying}>
              {copying ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copying ? "Menyalin..." : copied ? "Tersalin" : "Salin password"}
            </button>
            <button className="button button-primary" type="button" onClick={finishReset} disabled={reloading} aria-busy={reloading}>
              {reloading && <LoaderCircle className="animate-spin" aria-hidden="true" />} {reloading ? "Memuat ulang..." : "Selesai"}
            </button>
          </div>
          <small>Password ini hanya ditampilkan sekali dan tidak disimpan sebagai teks.</small>
        </div> : <form action={action} className="reset-confirm" onSubmit={() => setDismissed(false)}>
          <input type="hidden" name="userId" value={userId} />
          <p>Reset akun <strong>{accountName}</strong> sekarang?</p>
          {state.error && <p className="form-message error" role="alert">{state.error}</p>}
          <div className="dialog-actions"><button className="button button-secondary" type="button" data-dialog-autofocus onClick={() => setOpen(false)}><X aria-hidden="true" /> Batal</button><ResetSubmitButton /></div>
        </form>}
      </AppDialog>
    </>
  );
}
