import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavigationLoading } from "@/components/navigation-loading";
import { siteConfig } from "@/lib/site-config";

const geist = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${siteConfig.productName} | ${siteConfig.schoolName}`,
  description: `Sistem pengelolaan piket, absensi, dan rekap ${siteConfig.schoolName}.`,
  icons: {
    icon: [{ url: siteConfig.logoPath, type: "image/png" }],
    shortcut: [{ url: siteConfig.logoPath, type: "image/png" }],
    apple: [{ url: siteConfig.logoPath, type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body className={`${geist.variable} ${geistMono.variable}`}><Suspense fallback={null}><NavigationLoading /></Suspense>{children}</body></html>;
}
