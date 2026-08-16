"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({ message, label = "Hapus" }: { message: string; label?: string }) {
  const { pending } = useFormStatus();
  return <button className="icon-button danger" title={pending ? "Menghapus..." : label} aria-label={pending ? "Menghapus..." : label} aria-busy={pending} disabled={pending} onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</button>;
}
