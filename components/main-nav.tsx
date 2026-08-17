"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpCircle, BarChart3, CalendarDays, ClipboardCheck, Fingerprint, GraduationCap, LayoutDashboard, LineChart, Menu, UserCog, UserRoundCheck, UsersRound } from "lucide-react";
import { AppDialog } from "./app-dialog";

const items = [
  { href: "/dashboard", label: "Ringkasan", mobileLabel: "Beranda", icon: LayoutDashboard, roles: ["ADMIN", "GURU_PIKET", "GURU"] },
  { href: "/monitoring", label: "Pemantauan piket", mobileLabel: "Pantau", icon: LineChart, roles: ["ADMIN", "WAKASEK_KURIKULUM"] },
  { href: "/attendance", label: "Absensi", mobileLabel: "Absensi", icon: ClipboardCheck, roles: ["ADMIN", "GURU_PIKET"] },
  { href: "/schedule", label: "Jadwal piket", mobileLabel: "Jadwal", icon: CalendarDays, adminOnly: true },
  { href: "/teachers", label: "Data guru", mobileLabel: "Guru", icon: UsersRound, adminOnly: true },
  { href: "/classes", label: "Data kelas", mobileLabel: "Kelas", icon: GraduationCap, adminOnly: true },
  { href: "/students", label: "Data siswa", mobileLabel: "Siswa", icon: UserRoundCheck, adminOnly: true },
  { href: "/academic-years", label: "Kenaikan kelas", mobileLabel: "Kenaikan", icon: ArrowUpCircle, adminOnly: true },
  { href: "/accounts", label: "Manajemen akun", mobileLabel: "Akun", icon: UserCog, adminOnly: true },
  { href: "/reports", label: "Rekap operasional", mobileLabel: "Rekap", icon: BarChart3, roles: ["ADMIN", "GURU_PIKET"] },
  { href: "/security", label: "Keamanan login", mobileLabel: "Keamanan", icon: Fingerprint },
] as const;

const rolePrimaryRoutes: Record<string, readonly string[]> = {
  ADMIN: ["/dashboard", "/schedule", "/teachers", "/accounts"],
  GURU_PIKET: ["/dashboard", "/attendance", "/reports", "/security"],
  WAKASEK_KURIKULUM: ["/monitoring", "/security"],
  GURU: ["/dashboard", "/security"],
};

export function MainNav({ role }: { role: string }) {
  const pathname = usePathname();
  const visibleItems = navigationItems(role);
  return <nav className="desktop-nav" aria-label="Navigasi utama"><span className="nav-caption">RUANG KERJA</span>{visibleItems.map(({ href, label, icon: Icon }) => { const active = isActivePath(pathname, href); return <Link key={href} href={href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" />{label}</Link>; })}</nav>;
}

function navigationItems(role: string) {
  return items.filter((item) => (!("adminOnly" in item) || !item.adminOnly || role === "ADMIN") && (!("roles" in item) || (item.roles as readonly string[]).includes(role)));
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav({ role }: { role: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleItems = navigationItems(role);
  const preferred = rolePrimaryRoutes[role] || rolePrimaryRoutes.GURU;
  const primaryItems = visibleItems.length <= 4
    ? visibleItems
    : preferred.map((href) => visibleItems.find((item) => item.href === href)).filter((item): item is (typeof visibleItems)[number] => Boolean(item)).slice(0, 4);
  const remainingItems = visibleItems.filter((item) => !primaryItems.some((primary) => primary.href === item.href));
  const menuActive = remainingItems.some((item) => isActivePath(pathname, item.href));

  return <>
    <nav className="mobile-bottom-nav" aria-label="Navigasi aplikasi">
      {primaryItems.map(({ href, mobileLabel, icon: Icon }) => { const active = isActivePath(pathname, href); return <Link key={href} href={href} className={`mobile-nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{mobileLabel}</span></Link>; })}
      {remainingItems.length > 0 && <button type="button" className={`mobile-nav-link${menuActive ? " active" : ""}`} onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen}><Menu aria-hidden="true" /><span>Menu</span></button>}
    </nav>
    <AppDialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu lainnya" description="Pilih ruang kerja yang ingin dibuka.">
      <nav className="mobile-menu-grid" aria-label="Menu lainnya">
        {remainingItems.map(({ href, label, icon: Icon }) => { const active = isActivePath(pathname, href); return <Link key={href} href={href} className={`mobile-menu-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}><span><Icon aria-hidden="true" /></span><strong>{label}</strong></Link>; })}
      </nav>
    </AppDialog>
  </>;
}
