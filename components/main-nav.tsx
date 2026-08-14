"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpCircle, BarChart3, CalendarDays, ClipboardCheck, Fingerprint, GraduationCap, LayoutDashboard, LineChart, UserCog, UserRoundCheck, UsersRound } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard, roles: ["ADMIN", "GURU_PIKET", "GURU"] },
  { href: "/monitoring", label: "Pemantauan piket", icon: LineChart, roles: ["ADMIN", "WAKASEK_KURIKULUM"] },
  { href: "/attendance", label: "Absensi", icon: ClipboardCheck, roles: ["ADMIN", "GURU_PIKET"] },
  { href: "/schedule", label: "Jadwal piket", icon: CalendarDays, adminOnly: true },
  { href: "/teachers", label: "Data guru", icon: UsersRound, adminOnly: true },
  { href: "/classes", label: "Data kelas", icon: GraduationCap, adminOnly: true },
  { href: "/students", label: "Data siswa", icon: UserRoundCheck, adminOnly: true },
  { href: "/academic-years", label: "Kenaikan kelas", icon: ArrowUpCircle, adminOnly: true },
  { href: "/accounts", label: "Manajemen akun", icon: UserCog, adminOnly: true },
  { href: "/reports", label: "Rekap operasional", icon: BarChart3, roles: ["ADMIN", "GURU_PIKET"] },
  { href: "/security", label: "Keamanan login", icon: Fingerprint },
] as const;

export function MainNav({ role }: { role: string }) {
  const pathname = usePathname();
  return <nav aria-label="Navigasi utama"><span className="nav-caption">RUANG KERJA</span>{items.filter((item) => (!("adminOnly" in item) || !item.adminOnly || role === "ADMIN") && (!("roles" in item) || (item.roles as readonly string[]).includes(role))).map(({ href, label, icon: Icon }) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" />{label}</Link>; })}</nav>;
}
