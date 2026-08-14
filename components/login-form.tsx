"use client";

import { useActionState, useRef } from "react";
import { UserRound } from "lucide-react";
import { loginAction } from "@/app/actions";
import { PasskeyLoginButton } from "./passkey-login-button";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {});
  const usernameRef = useRef<HTMLInputElement>(null);
  return (
    <form action={action} className="login-form">
      <label className="field">
        <span>Username</span>
        <span className="input-icon"><UserRound aria-hidden="true" /><input ref={usernameRef} name="username" autoComplete="username webauthn" placeholder="piket01" required /></span>
      </label>
      <PasswordField label="Kata sandi" name="password" autoComplete="current-password" />
      {state.error && <p className="form-message error" role="alert">{state.error}</p>}
      <PasskeyLoginButton getUsername={() => usernameRef.current?.value || ""} />
      <div className="login-divider"><span>atau gunakan password</span></div>
      <SubmitButton className="w-full">Masuk dengan password</SubmitButton>
    </form>
  );
}
