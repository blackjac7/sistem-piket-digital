import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: path.resolve(process.cwd()) },
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
