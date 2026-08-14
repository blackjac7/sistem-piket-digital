import Image from "next/image";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { skipPasskeyOnboardingAction } from "@/app/actions";
import { PasskeyRegisterCard } from "@/components/passkey-register-card";
import { db } from "@/db";
import { passkeys } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export default async function PasskeyOnboardingPage() {
  const user = await requireUser();
  if (user.role !== "GURU_PIKET") redirect("/dashboard");
  const [result] = await db.select({ value: count() }).from(passkeys).where(eq(passkeys.userId, user.id));
  if (result.value > 0) redirect("/dashboard");
  return <main className="onboarding-shell"><header className="onboarding-brand"><Image src={siteConfig.logoPath} alt="" width={44} height={44} priority /><span><strong>{siteConfig.schoolName}</strong><small>{siteConfig.productName}</small></span></header><section className="onboarding-page"><div className="onboarding-copy"><span className="step-label">PENYIAPAN AKUN · 1 MENIT</span><h1>Masuk lebih cepat pada piket berikutnya</h1><p>Aktifkan passkey sekali. Setelah itu cukup gunakan sidik jari, wajah, atau PIN perangkat untuk masuk.</p></div><PasskeyRegisterCard count={0} onboarding /><form action={skipPasskeyOnboardingAction}><button className="button button-ghost" type="submit">Nanti saja, masuk ke dashboard</button></form><p className="onboarding-note">Passkey tetap dapat diaktifkan nanti melalui menu Keamanan login.</p></section></main>;
}
