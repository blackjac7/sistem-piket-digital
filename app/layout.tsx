import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavigationLoading } from "@/components/navigation-loading";
import { LaunchSplash } from "@/components/launch-splash";
import { PwaManager } from "@/components/pwa-manager";
import { siteConfig } from "@/lib/site-config";

const geist = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${siteConfig.productName} | ${siteConfig.schoolName}`,
  description: `Sistem pengelolaan piket, absensi, dan rekap ${siteConfig.schoolName}.`,
  applicationName: siteConfig.productName,
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" }],
    shortcut: [{ url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Piket YAKIN", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#123a5a",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body className={`${geist.variable} ${geistMono.variable}`}><LaunchSplash /><Suspense fallback={null}><NavigationLoading /></Suspense>{children}<PwaManager /></body></html>;
}
