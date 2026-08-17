"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { useOffline } from "next/offline";
import { cn } from "@/lib/utils";

export function SubmitButton({ children, className, disabled = false, pendingLabel = "Memproses...", title, ariaLabel }: { children: React.ReactNode; className?: string; disabled?: boolean; pendingLabel?: string; title?: string; ariaLabel?: string }) {
  const { pending } = useFormStatus();
  const offline = useOffline();
  const activeLabel = pending && offline ? "Menunggu koneksi..." : pendingLabel;
  return (
    <button className={cn("button button-primary", className)} disabled={pending || disabled} type="submit" aria-busy={pending} aria-label={ariaLabel} title={title}>
      <span className="button-content">
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        {pending ? activeLabel : children}
      </span>
    </button>
  );
}
