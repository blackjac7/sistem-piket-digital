"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { resetUserPasswordAction } from "@/app/actions";

function ResetSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="button button-primary small" type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} {pending ? "Mereset..." : "Ya, reset akun"}</button>;
}

export function ResetPasswordControl({ userId, accountName }: { userId: number; accountName: string }) {
  const [state, action] = useActionState(resetUserPasswordAction, {});
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (state.temporaryPassword && !dismissed) {
    return (
      <div className="temporary-password" role="status">
        <strong>Kata sandi sementara</strong>
        <code>{state.temporaryPassword}</code>
        <div>
          <button className="button button-secondary small" type="button" onClick={async () => { await navigator.clipboard.writeText(state.temporaryPassword!); setCopied(true); }}>
            {copied ? <Check /> : <Copy />} {copied ? "Tersalin" : "Salin"}
          </button>
          <button className="button button-ghost small" type="button" onClick={() => { setDismissed(true); window.location.reload(); }}>Selesai</button>
        </div>
        <small>Kirim secara pribadi kepada {state.accountName}. Password ini tidak disimpan dalam bentuk teks.</small>
      </div>
    );
  }

  if (!confirming) return <button className="button button-secondary small" type="button" onClick={() => { setConfirming(true); setDismissed(false); setCopied(false); }}><KeyRound /> Reset password</button>;

  return (
    <form action={action} className="reset-confirm" onSubmit={() => setDismissed(false)}>
      <input type="hidden" name="userId" value={userId} />
      <p>Reset password <strong>{accountName}</strong> dan keluarkan semua sesinya?</p>
      {state.error && <p className="form-message error" role="alert">{state.error}</p>}
      <div><ResetSubmitButton /><button className="button button-ghost small" type="button" onClick={() => setConfirming(false)}><X /> Batal</button></div>
    </form>
  );
}
