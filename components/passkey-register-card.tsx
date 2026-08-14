"use client";

import { useState } from "react";
import { Fingerprint, LoaderCircle, ShieldCheck } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/lib/site-config";

export function PasskeyRegisterCard({ count, onboarding = false }: { count: number; onboarding?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function register() {
    if (!window.PublicKeyCredential) { setMessage("Perangkat ini belum mendukung passkey."); return; }
    setLoading(true); setMessage("");
    try {
      const optionsResponse = await fetch("/api/passkeys/register/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error);
      const credential = await startRegistration({ optionsJSON: options });
      const verificationResponse = await fetch("/api/passkeys/register/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential) });
      const result = await verificationResponse.json();
      if (!verificationResponse.ok || !result.verified) throw new Error(result.error || "Verifikasi gagal.");
      setMessage("Passkey berhasil didaftarkan. Sekarang Anda dapat login tanpa password.");
      setLoading(false);
      if (onboarding) { setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 900); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pendaftaran passkey gagal."); setLoading(false); }
  }
  return <article className="passkey-card"><span className="passkey-icon" aria-hidden="true"><Fingerprint /></span><div><span className="eyebrow"><ShieldCheck /> LOGIN LEBIH CEPAT</span><h2>{siteConfig.passkeyLabel}</h2><p>Biometrik hanya diproses oleh perangkat. Aplikasi tidak menyimpan foto wajah atau sidik jari.</p>{!onboarding && <span className="registered-count">{count} passkey telah terdaftar</span>}<div aria-live="polite">{message && <p className={message.startsWith("Passkey berhasil") ? "form-message success" : "form-message error"}>{message}</p>}</div><button type="button" className="button button-primary" onClick={register} disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <Fingerprint />}{loading ? "Ikuti petunjuk perangkat..." : onboarding ? "Aktifkan passkey sekarang" : "Daftarkan perangkat ini"}</button></div></article>;
}
