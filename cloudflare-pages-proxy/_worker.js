const upstreamOrigin = "https://riichi-tournament-manager.hmx-mahjong.workers.dev";
const upstreamHost = new URL(upstreamOrigin).host;
const tutorialOrigin = "https://xuanxuan-mahjong-cases.pages.dev";

// 免费版 Worker 每条请求只有 10ms CPU，而统计页面每次都要解析全部牌谱（几十到几百毫秒），
// 超限时 Cloudflare 直接返回 "Worker exceeded resource limits"（错误 1102）。
// 这层代理因此对匿名 GET 做边缘缓存，并且是"陈旧副本 + 后台刷新"：
//   1. freshSeconds 内是新鲜副本，直接返回，完全不调用上游 Worker；
//   2. 过期后先返回旧副本，再在后台刷新；刷新失败（例如上游又超限）就继续用旧副本。
// 这样即使上游偶发超限，访问者也不会看到错误页。
// 带 Cookie 的请求（管理员、选手协商会话）一律直连上游，保证登录态与写入后的页面始终最新。
const freshSeconds = 45;
const staleSeconds = 60 * 60 * 6;
// 同一个 isolate 内正在后台刷新的 key，避免并发重复刷新。
const refreshing = new Set();

function compactHash(input) {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// 同一个 URL 下可能同时有 HTML 文档、RSC 直出数据、预取请求，必须各存一份，否则会串内容。
function requestVariant(request) {
  return compactHash([
    request.headers.get("rsc") || "",
    request.headers.get("next-router-prefetch") || "",
    request.headers.get("next-router-state-tree") || "",
    request.headers.get("next-url") || "",
    request.headers.get("accept") || "",
    request.headers.get("accept-encoding") || "",
  ].join("\u0000"));
}

function edgeCacheTtl(contentType) {
  if (contentType.startsWith("text/html") || contentType.startsWith("image/")) return staleSeconds;
  return 0;
}

function upstreamRequestHeaders(request, publicUrl) {
  const headers = new Headers(request.headers);
  const origin = headers.get("origin");
  const referer = headers.get("referer");
  if (origin === publicUrl.origin) headers.set("origin", upstreamOrigin);
  if (referer?.startsWith(publicUrl.origin)) headers.set("referer", `${upstreamOrigin}${referer.slice(publicUrl.origin.length)}`);
  headers.set("x-forwarded-host", upstreamHost);
  headers.set("x-forwarded-proto", "https");
  return headers;
}

function fetchUpstream(request, publicUrl, body) {
  return fetch(new URL(`${publicUrl.pathname}${publicUrl.search}`, upstreamOrigin), {
    method: request.method,
    headers: upstreamRequestHeaders(request, publicUrl),
    body,
    redirect: "manual",
  });
}

/** 能否安全缓存复用：必须 200、是 HTML/图片、且没有 set-cookie。返回 TTL（0 表示不缓存）。 */
function cacheableTtl(response) {
  if (response.status !== 200 || response.headers.has("set-cookie")) return 0;
  return edgeCacheTtl((response.headers.get("content-type") || "").toLowerCase());
}

function makeStorable(body, responseHeaders, ttl) {
  const headers = new Headers(responseHeaders);
  // 变体已经写进 cacheKey，这里去掉 Vary，避免边缘按上游的 Vary 再拆一次导致命中率下降。
  headers.delete("vary");
  headers.delete("set-cookie");
  headers.set("cache-control", `public, max-age=${freshSeconds}, s-maxage=${ttl}`);
  headers.set("x-mj-stored-at", new Date().toISOString());
  headers.set("x-mj-edge-cache", "MISS");
  return new Response(body, { status: 200, statusText: "OK", headers });
}

async function revalidate(request, publicUrl, cacheKey, cache) {
  if (refreshing.has(cacheKey.url)) return;
  refreshing.add(cacheKey.url);
  try {
    const response = await fetchUpstream(request, publicUrl, undefined);
    const ttl = cacheableTtl(response);
    if (!ttl) return;
    const storable = makeStorable(await response.arrayBuffer(), response.headers, ttl);
    await cache.put(cacheKey, storable).catch(() => {});
  } catch {
    // 后台刷新失败就保留旧副本，访问者不会受影响。
  } finally {
    refreshing.delete(cacheKey.url);
  }
}

export default {
  async fetch(request, env, ctx) {
    const publicUrl = new URL(request.url);
    if ((request.method === "GET" || request.method === "HEAD")
        && (publicUrl.pathname === "/tutorials" || publicUrl.pathname.startsWith("/tutorials/"))) {
      return Response.redirect(new URL(`${publicUrl.pathname}${publicUrl.search}`, tutorialOrigin), 302);
    }

    const cacheable = request.method === "GET"
      && !request.headers.get("cookie")
      && !request.headers.get("authorization")
      && !request.headers.get("x-mj-no-edge-cache")
      && !(publicUrl.pathname.startsWith("/api/") && !publicUrl.pathname.startsWith("/api/avatars/"));
    const edgeCache = caches.default;
    let cacheKey;
    if (cacheable) {
      const keyUrl = new URL(publicUrl.toString());
      keyUrl.searchParams.set("__mj_edge", requestVariant(request));
      cacheKey = new Request(keyUrl.toString(), { method: "GET" });
      const cached = await edgeCache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        const storedAt = Date.parse(cached.headers.get("x-mj-stored-at") || "") || 0;
        const ageSeconds = storedAt ? (Date.now() - storedAt) / 1000 : Number.POSITIVE_INFINITY;
        if (ageSeconds <= freshSeconds) {
          headers.set("x-mj-edge-cache", "HIT");
        } else {
          headers.set("x-mj-edge-cache", "STALE");
          ctx.waitUntil(revalidate(request, publicUrl, cacheKey, edgeCache));
        }
        return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
      }
    }

    const upstreamResponse = await fetchUpstream(request, publicUrl, request.method === "GET" || request.method === "HEAD" ? undefined : request.body);
    const responseHeaders = new Headers(upstreamResponse.headers);
    const location = responseHeaders.get("location");
    if (location?.startsWith(upstreamOrigin)) {
      responseHeaders.set("location", `${publicUrl.origin}${location.slice(upstreamOrigin.length)}`);
    }

    if (cacheKey) {
      const ttl = cacheableTtl(upstreamResponse);
      if (ttl) {
        const storable = makeStorable(await upstreamResponse.arrayBuffer(), responseHeaders, ttl);
        await edgeCache.put(cacheKey, storable.clone()).catch(() => {});
        return storable;
      }
      responseHeaders.set("x-mj-edge-cache", upstreamResponse.status === 200 ? "BYPASS" : "ERROR");
    }
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};
