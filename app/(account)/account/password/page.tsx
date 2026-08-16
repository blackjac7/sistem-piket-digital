import Image from "next/image";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { PasswordChangeForm } from "@/components/password-change-form";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <main className="account-shell">
      <header className="account-brand"><span><Image src={siteConfig.logoPath} alt="" width={38} height={38} priority /></span><div><strong>{siteConfig.schoolName}</strong><small>{siteConfig.productName}</small></div></header>
      <section className="account-card">
        <div className="account-card-icon"><KeyRound aria-hidden="true" /></div>
        <div>
          <span className="eyebrow"><ShieldCheck /> KEAMANAN AKUN</span>
          <h1>{user.mustChangePassword ? "Buat kata sandi pribadi" : "Ubah kata sandi"}</h1>
          <p>{user.mustChangePassword ? "Kata sandi sementara hanya untuk masuk pertama kali. Ganti sekarang sebelum melanjutkan ke sistem." : "Masukkan kata sandi saat ini untuk memastikan perubahan dilakukan oleh Anda."}</p>
          <ul className="password-guidance"><li>Minimal 8 karakter</li><li>Hindari nama, username, dan kata sandi lama</li><li>Setelah disimpan, sesi lain otomatis keluar</li></ul>
          <PasswordChangeForm />
          <form action={logoutAction} className="account-logout"><SubmitButton className="button-ghost" pendingLabel="Mengakhiri sesi..."><LogOut /> Keluar dan ganti nanti</SubmitButton></form>
        </div>
      </section>
    </main>
  );
}
