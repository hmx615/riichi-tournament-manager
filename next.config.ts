import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
    // 页面均读取 D1，属于动态渲染；默认 dynamic 为 0 秒，来回切换会重复请求。
    // 保留 30 秒客户端缓存让赛程/数据/人物之间的切换即时完成，管理员写入时已有 revalidatePath 负责失效。
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  outputFileTracingExcludes: {
    "/*": ["./data/naga-reports/**/*", "./data/backups/**/*"],
  },
  ...(process.env.BUILD_STANDALONE === "true" ? { output: "standalone" as const } : {}),
};

export default nextConfig;

if (process.env.NODE_ENV === "development" && process.env.CLOUDFLARE_DEV === "true") {
  initOpenNextCloudflareForDev();
}
