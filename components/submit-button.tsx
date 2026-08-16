"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SubmitButton({ children, className, disabled = false, pendingLabel = "Memproses...", title, ariaLabel }: { children: React.ReactNode; className?: string; disabled?: boolean; pendingLabel?: string; title?: string; ariaLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={cn("button button-primary", className)} disabled={pending || disabled} type="submit" aria-busy={pending} aria-label={ariaLabel} title={title}>
      <span className="button-content">
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        {pending ? pendingLabel : children}
      </span>
    </button>
  );
}
