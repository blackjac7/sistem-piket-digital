import Image from "next/image";
import { LogOut, ShieldCheck } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { roleLabels, siteConfig } from "@/lib/site-config";
import { MainNav, MobileNav } from "./main-nav";
import { SubmitButton } from "./submit-button";

export function AppShell({ user, children }: { user: { name: string; username: string; role: string }; children: React.ReactNode }) {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
      <aside className="sidebar">
        <div className="school-brand"><span className="brand-symbol"><Image src={siteConfig.logoPath} alt="" width={34} height={34} priority /></span><span><strong>{siteConfig.schoolName}</strong><small>{siteConfig.productName}</small></span></div>
        <MainNav role={user.role} />
        <div className="sidebar-user">
          <span className="avatar">{user.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span>
          <span><strong>{user.name}</strong><small>{roleLabels[user.role] || user.role.replaceAll("_", " ")}</small></span>
          <form action={logoutAction}><SubmitButton className="icon-button" title="Keluar" ariaLabel="Keluar" pendingLabel=""><LogOut /></SubmitButton></form>
        </div>
      </aside>
      <header className="mobile-app-header">
        <div className="mobile-app-brand"><span><Image src={siteConfig.logoPath} alt="" width={30} height={30} priority /></span><div><strong>{siteConfig.schoolName}</strong><small>{siteConfig.productName}</small></div></div>
        <div className="mobile-app-user"><span className="avatar">{user.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{user.name}</strong><small>{roleLabels[user.role] || user.role.replaceAll("_", " ")}</small></span><form action={logoutAction}><SubmitButton className="icon-button" title="Keluar" ariaLabel="Keluar" pendingLabel=""><LogOut /></SubmitButton></form></div>
      </header>
      <main className="main-area" id="main-content" tabIndex={-1}>
        <header className="topbar"><div><span className="eyebrow"><ShieldCheck aria-hidden="true" /> Sistem internal sekolah</span></div><div className="connection" role="status" aria-label="Status sistem"><span aria-hidden="true" /> Sistem aktif</div></header>
        <div className="page-content">{children}</div>
      </main>
      <MobileNav role={user.role} />
    </div>
  );
}
