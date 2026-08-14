"use client";

import { useState } from "react";
import { Fingerprint, LoaderCircle } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";

export function PasskeyLoginButton({ getUsername }: { getUsername: () => string }) {
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function login() {
    const username = getUsername().trim();
    if (!username) { setMessage("Isi username terlebih dahulu."); return; }
    if (!window.PublicKeyCredential) { setMessage("Browser/perangkat ini belum mendukung passkey."); return; }
    setStatus("loading"); setMessage("");
    try {
      const optionsResponse = await fetch("/api/passkeys/login/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error);
      const credential = await startAuthentication({ optionsJSON: options });
      const verificationResponse = await fetch("/api/passkeys/login/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential) });
      const result = await verificationResponse.json();
      if (!verificationResponse.ok || !result.verified) throw new Error(result.error || "Verifikasi gagal.");
      router.push(result.redirectTo || "/dashboard"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Login passkey gagal."); setStatus("idle"); }
  }
  return <><button className="button passkey-button" type="button" onClick={login} disabled={status === "loading"}>{status === "loading" ? <LoaderCircle className="animate-spin" /> : <Fingerprint />} Masuk dengan sidik jari / wajah</button>{message && <p className="form-message error">{message}</p>}</>;
}
