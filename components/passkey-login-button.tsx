"use client";

import { useState } from "react";
import { Fingerprint, LoaderCircle } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";

function passkeyErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Tidak ada passkey yang dipilih atau proses dibatalkan. Coba lagi atau gunakan password.";
  }
  if (error instanceof Error && /timed out|not allowed|cancelled|canceled/i.test(error.message)) {
    return "Tidak ada passkey yang dipilih atau proses dibatalkan. Coba lagi atau gunakan password.";
  }
  return error instanceof Error ? error.message : "Login passkey gagal.";
}

export function PasskeyLoginButton() {
  const [status, setStatus] = useState<"idle" | "requesting" | "verifying" | "redirecting">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function login() {
    if (!window.PublicKeyCredential) { setMessage("Browser/perangkat ini belum mendukung passkey."); return; }
    setStatus("requesting"); setMessage("");
    try {
      const optionsResponse = await fetch("/api/passkeys/login/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error);
      const credential = await startAuthentication({ optionsJSON: options });
      setStatus("verifying");
      const verificationResponse = await fetch("/api/passkeys/login/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential) });
      const result = await verificationResponse.json();
      if (!verificationResponse.ok || !result.verified) throw new Error(result.error || "Verifikasi gagal.");
      setStatus("redirecting");
      window.dispatchEvent(new CustomEvent("app-loading-start", { detail: { label: "Membuka ruang kerja" } }));
      router.push(result.redirectTo || "/dashboard"); router.refresh();
    } catch (error) { setMessage(passkeyErrorMessage(error)); setStatus("idle"); }
  }
  const loading = status !== "idle";
  const label = status === "requesting" ? "Pilih passkey di perangkat..." : status === "verifying" ? "Memverifikasi passkey..." : status === "redirecting" ? "Membuka ruang kerja..." : "Masuk dengan passkey";
  return <><button className="button passkey-button" type="button" onClick={login} disabled={loading} aria-busy={loading}>{loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Fingerprint aria-hidden="true" />} {label}</button>{message && <p className="form-message error">{message}</p>}</>;
}
