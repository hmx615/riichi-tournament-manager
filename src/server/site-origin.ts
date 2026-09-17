import { headers } from "next/headers";

// 对外入口域名。*.workers.dev 在国内网络会被 DNS 污染 + SNI 阻断（表现为打不开或 Cloudflare 1022），
// 所有需要发给外部使用者的绝对链接都必须指向 Pages 代理入口。
const publicFallbackOrigin = "https://riichi-tournament-manager.pages.dev";

function isWorkerDevHost(host: string) {
  return host === "workers.dev" || host.endsWith(".workers.dev");
}

/** 纯函数：根据请求头里的 host / 协议推出对外访问源。 */
export function resolvePublicOrigin({ host, protocol, fallback }: { host: string; protocol?: string | null; fallback?: string }) {
  const fallbackOrigin = (fallback?.trim() || process.env.PUBLIC_SITE_ORIGIN?.trim() || publicFallbackOrigin).replace(/\/+$/, "");
  const normalizedHost = host.split(",")[0].trim().toLowerCase();
  // pages 代理转发给 Worker 时 Host/x-forwarded-host 会变成 workers.dev，此时必须回落到对外入口。
  if (!normalizedHost || isWorkerDevHost(normalizedHost)) return fallbackOrigin;
  const resolvedProtocol = protocol?.trim() || (normalizedHost.startsWith("localhost") || normalizedHost.startsWith("127.") ? "http" : "https");
  return `${resolvedProtocol}://${normalizedHost}`;
}

/** 返回当前请求对应的对外访问源（含协议），用于生成要发给选手的绝对链接。 */
export async function publicSiteOrigin() {
  const headerList = await headers();
  return resolvePublicOrigin({
    host: headerList.get("x-forwarded-host") || headerList.get("host") || "",
    protocol: headerList.get("x-forwarded-proto"),
  });
}

export async function publicSiteUrl(path: string) {
  const origin = await publicSiteOrigin();
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
