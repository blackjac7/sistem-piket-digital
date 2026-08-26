"use client";

import { Archive, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AppDialog } from "./app-dialog";

export function ConfirmSubmitButton({ message, label = "Hapus", title = "Hapus catatan absensi?", description = "Tindakan ini akan menghapus data secara permanen dan tidak dapat dibatalkan.", confirmLabel = "Hapus catatan", icon = "trash" }: { message: string; label?: string; title?: string; description?: string; confirmLabel?: string; icon?: "trash" | "archive" }) {
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

  const Icon = icon === "archive" ? Archive : Trash2;

  return <>
    <button className="icon-button danger" type="button" title={pending ? "Memproses..." : label} aria-label={pending ? "Memproses..." : label} aria-busy={pending} disabled={pending} onClick={requestConfirmation}>{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Icon aria-hidden="true" />}</button>
    <AppDialog open={open} onClose={() => setOpen(false)} title={title} description={description} tone="danger">
      <p className="dialog-message">{message}</p>
      <div className="dialog-actions">
        <button className="button button-secondary" type="button" data-dialog-autofocus onClick={() => setOpen(false)}>Batal</button>
        <button className="button button-danger" type="button" onClick={confirm}><Icon aria-hidden="true" /> {confirmLabel}</button>
      </div>
    </AppDialog>
  </>;
}
