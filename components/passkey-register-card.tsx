"use client";

import { useState } from "react";
import { Fingerprint, LoaderCircle, ShieldCheck } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/lib/site-config";

export function PasskeyRegisterCard({ count, onboarding = false }: { count: number; onboarding?: boolean }) {
  const [status, setStatus] = useState<"idle" | "requesting" | "verifying" | "redirecting">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function register() {
    if (!window.PublicKeyCredential) { setMessage("Perangkat ini belum mendukung passkey."); return; }
    setStatus("requesting"); setMessage("");
    try {
      const optionsResponse = await fetch("/api/passkeys/register/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error);
      const credential = await startRegistration({ optionsJSON: options });
      setStatus("verifying");
      const verificationResponse = await fetch("/api/passkeys/register/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential) });
      const result = await verificationResponse.json();
      if (!verificationResponse.ok || !result.verified) throw new Error(result.error || "Verifikasi gagal.");
      setMessage("Passkey berhasil didaftarkan. Sekarang Anda dapat login tanpa password.");
      if (onboarding) {
        setStatus("redirecting");
        setTimeout(() => { window.dispatchEvent(new CustomEvent("app-loading-start", { detail: { label: "Membuka dashboard" } })); router.push("/dashboard"); router.refresh(); }, 900);
      } else setStatus("idle");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pendaftaran passkey gagal."); setStatus("idle"); }
  }
  const loading = status !== "idle";
  const buttonLabel = status === "requesting" ? "Ikuti petunjuk perangkat..." : status === "verifying" ? "Memverifikasi perangkat..." : status === "redirecting" ? "Membuka dashboard..." : onboarding ? "Aktifkan passkey sekarang" : "Daftarkan perangkat ini";
  return <article className="passkey-card"><span className="passkey-icon" aria-hidden="true"><Fingerprint /></span><div><span className="eyebrow"><ShieldCheck /> LOGIN LEBIH CEPAT</span><h2>{siteConfig.passkeyLabel}</h2><p>Biometrik hanya diproses oleh perangkat. Aplikasi tidak menyimpan foto wajah atau sidik jari.</p>{!onboarding && <span className="registered-count">{count} passkey telah terdaftar</span>}<div aria-live="polite">{message && <p className={message.startsWith("Passkey berhasil") ? "form-message success" : "form-message error"}>{message}</p>}</div><button type="button" className="button button-primary" onClick={register} disabled={loading} aria-busy={loading}>{loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}{buttonLabel}</button></div></article>;
}
