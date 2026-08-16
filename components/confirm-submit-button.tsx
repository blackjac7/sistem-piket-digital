"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AppDialog } from "./app-dialog";

export function ConfirmSubmitButton({ message, label = "Hapus" }: { message: string; label?: string }) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  function requestConfirmation(event: React.MouseEvent<HTMLButtonElement>) {
    formRef.current = event.currentTarget.form;
    setOpen(true);
  }

  function confirm() {
    setOpen(false);
    formRef.current?.requestSubmit();
  }

  return <>
    <button className="icon-button danger" type="button" title={pending ? "Menghapus..." : label} aria-label={pending ? "Menghapus..." : label} aria-busy={pending} disabled={pending} onClick={requestConfirmation}>{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</button>
    <AppDialog open={open} onClose={() => setOpen(false)} title="Hapus catatan absensi?" description="Tindakan ini akan menghapus data secara permanen dan tidak dapat dibatalkan." tone="danger">
      <p className="dialog-message">{message}</p>
      <div className="dialog-actions">
        <button className="button button-secondary" type="button" data-dialog-autofocus onClick={() => setOpen(false)}>Batal</button>
        <button className="button button-danger" type="button" onClick={confirm}><Trash2 aria-hidden="true" /> Hapus catatan</button>
      </div>
    </AppDialog>
  </>;
}
