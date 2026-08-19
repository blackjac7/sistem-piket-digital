"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { PasskeyLoginButton } from "./passkey-login-button";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";

export function LoginForm() {
  const [error, setError] = useState<string>();

  async function login(formData: FormData) {
    setError(undefined);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };
      if (!response.ok || !result.redirectTo) {
        setError(result.error || "Login gagal diproses. Coba kembali.");
        return;
      }
      window.dispatchEvent(
        new CustomEvent("app-loading-start", {
          detail: { label: "Menyiapkan ruang kerja" },
        }),
      );
      window.location.assign(result.redirectTo);
    } catch {
      setError("Tidak dapat terhubung ke server. Coba kembali.");
    }
  }

  return (
    <form action={login} className="login-form">
      <PasskeyLoginButton />
      <div className="login-divider">
        <span>atau masuk dengan password</span>
      </div>
      <label className="field">
        <span>Username</span>
        <span className="input-icon">
          <UserRound aria-hidden="true" />
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="umisultra"
            required
          />
        </span>
      </label>
      <PasswordField
        label="Kata sandi"
        name="password"
        autoComplete="current-password"
      />
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      <SubmitButton className="w-full" pendingLabel="Memverifikasi akun...">
        Masuk dengan password
      </SubmitButton>
    </form>
  );
}
