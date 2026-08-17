"use client";

import { useActionState } from "react";
import { changeOwnPasswordAction } from "@/app/actions";
import { MutationRequestInput } from "./mutation-request-input";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";

export function PasswordChangeForm() {
  const [state, action] = useActionState(changeOwnPasswordAction, {});
  return (
    <form action={action} className="form-stack password-form">
      <MutationRequestInput resetKey={state} />
      <PasswordField label="Kata sandi saat ini" name="currentPassword" autoComplete="current-password" />
      <PasswordField label="Kata sandi baru" name="newPassword" autoComplete="new-password" helperText="Minimal 8 karakter. Gunakan frasa sandi unik atau password manager." />
      <PasswordField label="Ulangi kata sandi baru" name="confirmPassword" autoComplete="new-password" />
      {state.error && <p className="form-message error" role="alert">{state.error}</p>}
      <SubmitButton>Simpan kata sandi baru</SubmitButton>
    </form>
  );
}
