import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sistem Piket Digital | SMP IP YAKIN",
    short_name: "Piket YAKIN",
    description: "Ruang kerja digital untuk piket, absensi, dan rekap SMP IP YAKIN.",
    start_url: "/login?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "id-ID",
    dir: "ltr",
    background_color: "#f4f6f9",
    theme_color: "#123a5a",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dashboard", short_name: "Dashboard", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Catat absensi", short_name: "Absensi", url: "/attendance", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
