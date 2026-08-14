"use client";

import { Trash2 } from "lucide-react";

export function ConfirmSubmitButton({ message, label = "Hapus" }: { message: string; label?: string }) {
  return <button className="icon-button danger" title={label} aria-label={label} onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}><Trash2 aria-hidden="true" /></button>;
}
