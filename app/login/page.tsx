import { redirect } from "next/navigation";
import Image from "next/image";
import { ClipboardCheck, Database, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { destinationForUser, getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(destinationForUser(user));
  return (
    <main className="login-page">
      <section className="login-identity">
        <div className="login-brand"><span><Image src={siteConfig.logoPath} alt={`Logo ${siteConfig.schoolName}`} width={42} height={42} priority /></span><div><strong>{siteConfig.schoolName}</strong><small>{siteConfig.productName}</small></div></div>
        <div className="login-copy">
          <span className="eyebrow light">RUANG GURU · SMP IP YAKIN</span>
          <h1>Piket lebih ringan.<br />Informasi tetap rapi.</h1>
          <p>Catat kehadiran, tindak lanjut, dan rekap sekolah melalui satu ruang kerja yang nyaman digunakan dari handphone.</p>
        </div>
        <div className="trust-row"><span><ShieldCheck /> Akses berbasis peran</span><span><Database /> PostgreSQL aman</span><span><ClipboardCheck /> Jejak audit</span></div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="environment-badge">RUANG KERJA SEKOLAH</span>
          <h2>Masuk ke ruang piket</h2>
          <p>Pilih passkey di perangkat, atau gunakan akun dari Admin IT sekolah.</p>
          <LoginForm />
          <p className="login-note">Sesi dilindungi cookie HTTP-only dan berakhir otomatis setelah tujuh hari.</p>
        </div>
      </section>
    </main>
  );
}
