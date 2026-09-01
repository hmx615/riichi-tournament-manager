import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  outputFileTracingExcludes: {
    "/*": ["./data/naga-reports/**/*", "./data/backups/**/*"],
  },
  ...(process.env.BUILD_STANDALONE === "true" ? { output: "standalone" as const } : {}),
};

export default nextConfig;

if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();
