"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/app/actions";
import { ConfirmFormButton, type ConfirmFormOptions } from "./confirm-form-button";
import { MutationRequestInput } from "./mutation-request-input";
import { SubmitButton } from "./submit-button";

export function ActionForm({
  action,
  children,
  submitLabel,
  resetOnSuccess = true,
  confirm,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  resetOnSuccess?: boolean;
  confirm?: ConfirmFormOptions;
}) {
  const [state, formAction] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success && resetOnSuccess) formRef.current?.reset();
  }, [state.success, resetOnSuccess]);

  return (
    <form action={formAction} ref={formRef} className="form-stack">
      <MutationRequestInput resetKey={state} />
      {children}
      {state.error && <p className="form-message error" role="alert">{state.error}</p>}
      {state.success && <p className="form-message success" role="status">{state.success}</p>}
      {confirm ? <ConfirmFormButton label={submitLabel} options={confirm} /> : <SubmitButton>{submitLabel}</SubmitButton>}
    </form>
  );
}
