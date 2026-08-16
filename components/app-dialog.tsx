"use client";

import { useEffect, useId, useRef } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type DialogTone = "neutral" | "danger" | "success";

const toneIcons = {
  neutral: Info,
  danger: AlertTriangle,
  success: CheckCircle2,
} as const;

export function AppDialog({
  open,
  onClose,
  title,
  description,
  tone = "neutral",
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  tone?: DialogTone;
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = `dialog-title-${useId().replace(/:/g, "")}`;
  const descriptionBaseId = useId().replace(/:/g, "");
  const descriptionId = description ? `dialog-description-${descriptionBaseId}` : undefined;
  const Icon = toneIcons[tone];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      document.documentElement.dataset.modalOpen = "true";
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => () => {
    delete document.documentElement.dataset.modalOpen;
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleClose() {
      if (!document.querySelector("dialog[open]")) delete document.documentElement.dataset.modalOpen;
      openerRef.current?.focus();
      openerRef.current = null;
      onClose();
    }

    function handleCancel(event: Event) {
      if (!dismissible) {
        event.preventDefault();
        return;
      }
      onClose();
    }

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, [dismissible, onClose]);

  function handleSurfaceClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && dismissible) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className={`app-dialog tone-${tone}`}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={handleSurfaceClick}
    >
      <section className="dialog-surface" role="document">
        <header className="dialog-header">
          <span className="dialog-icon" aria-hidden="true"><Icon /></span>
          <div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>
          {dismissible && <button className="dialog-close" type="button" onClick={onClose} aria-label="Tutup dialog"><X aria-hidden="true" /></button>}
        </header>
        <div className="dialog-content">{children}</div>
      </section>
    </dialog>
  );
}
