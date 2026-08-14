"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

export function ActionForm({
  action,
  children,
  submitLabel,
  resetOnSuccess = true,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success && resetOnSuccess) formRef.current?.reset();
  }, [state.success, resetOnSuccess]);

  return (
    <form action={formAction} ref={formRef} className="form-stack">
      {children}
      {state.error && <p className="form-message error" role="alert">{state.error}</p>}
      {state.success && <p className="form-message success" role="status">{state.success}</p>}
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
