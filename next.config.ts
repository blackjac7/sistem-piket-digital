import type { NextConfig } from "next";
import path from "node:path";

const isVercel = process.env.VERCEL === "1";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=(), browsing-topics=()" },
];

const privateRoutes = [
  "/login",
  "/dashboard/:path*",
  "/attendance/:path*",
  "/schedule/:path*",
  "/teachers/:path*",
  "/students/:path*",
  "/classes/:path*",
  "/academic-years/:path*",
  "/accounts/:path*",
  "/reports/:path*",
  "/monitoring/:path*",
  "/security/:path*",
  "/account/:path*",
  "/onboarding/:path*",
  "/api/:path*",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Vercel packages Next.js output itself; standalone is only needed by Docker.
  ...(!isVercel && { output: "standalone" as const }),
  poweredByHeader: false,
  turbopack: { root: path.resolve(process.cwd()) },
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...privateRoutes.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      })),
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; connect-src 'self'" },
        ],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
