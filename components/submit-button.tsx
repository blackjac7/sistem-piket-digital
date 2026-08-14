"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SubmitButton({ children, className, disabled = false }: { children: React.ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={cn("button button-primary", className)} disabled={pending || disabled} type="submit">
      {pending && <LoaderCircle className="size-4 animate-spin" />}
      {pending ? "Memproses..." : children}
    </button>
  );
}
