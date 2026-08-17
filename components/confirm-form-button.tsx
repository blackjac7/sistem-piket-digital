"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useOffline } from "next/offline";
import { AppDialog } from "./app-dialog";

export type ConfirmFormOptions = {
  title: string;
  description: string;
  message: string;
  confirmLabel: string;
};

export function ConfirmFormButton({ label, options }: { label: string; options: ConfirmFormOptions }) {
  const { pending } = useFormStatus();
  const offline = useOffline();
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
    <button className="button button-primary" type="button" disabled={pending} aria-busy={pending} onClick={requestConfirmation}>
      {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      {pending ? offline ? "Menunggu koneksi..." : "Memproses..." : label}
    </button>
    <AppDialog open={open} onClose={() => setOpen(false)} title={options.title} description={options.description} tone="danger">
      <p className="dialog-message">{options.message}</p>
      <div className="dialog-actions">
        <button className="button button-secondary" type="button" data-dialog-autofocus onClick={() => setOpen(false)}>Periksa kembali</button>
        <button className="button button-danger" type="button" onClick={confirm}><AlertTriangle aria-hidden="true" /> {options.confirmLabel}</button>
      </div>
    </AppDialog>
  </>;
}
