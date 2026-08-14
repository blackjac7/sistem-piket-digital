import { count, eq } from "drizzle-orm";
import { PasskeyRegisterCard } from "@/components/passkey-register-card";
import { PasswordChangeForm } from "@/components/password-change-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { passkeys } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export default async function SecurityPage() {
  const user = await requireUser();
  const [result] = await db.select({ value: count() }).from(passkeys).where(eq(passkeys.userId, user.id));
  return <><PageHeader title="Keamanan login" description="Kelola kata sandi dan daftarkan sidik jari, pengenalan wajah, atau PIN perangkat melalui passkey/WebAuthn." /><div className="security-grid"><section className="panel security-password-panel"><div className="panel-header"><div><h2>Ubah kata sandi</h2><p>Perubahan akan mengeluarkan sesi lain untuk melindungi akun Anda.</p></div></div><PasswordChangeForm /></section><PasskeyRegisterCard count={result.value} /></div></>;
}
