"use client";

import { useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { PasskeyLoginButton } from "./passkey-login-button";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";

export function LoginForm() {
  const [error, setError] = useState<string>();
  const usernameRef = useRef<HTMLInputElement>(null);

  async function login(formData: FormData) {
    setError(undefined);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", body: formData });
      const result = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok || !result.redirectTo) {
        setError(result.error || "Login gagal diproses. Coba kembali.");
        return;
      }
      window.location.assign(result.redirectTo);
    } catch {
      setError("Tidak dapat terhubung ke server. Coba kembali.");
    }
  }

  return (
    <form action={login} className="login-form">
      <label className="field">
        <span>Username</span>
        <span className="input-icon"><UserRound aria-hidden="true" /><input ref={usernameRef} name="username" autoComplete="username webauthn" placeholder="piket01" required /></span>
      </label>
      <PasswordField label="Kata sandi" name="password" autoComplete="current-password" />
      {error && <p className="form-message error" role="alert">{error}</p>}
      <PasskeyLoginButton getUsername={() => usernameRef.current?.value || ""} />
      <div className="login-divider"><span>atau gunakan password</span></div>
      <SubmitButton className="w-full">Masuk dengan password</SubmitButton>
    </form>
  );
}
