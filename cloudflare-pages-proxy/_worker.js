const upstreamOrigin = "https://riichi-tournament-manager.hmx-mahjong.workers.dev";
const upstreamHost = new URL(upstreamOrigin).host;

export default {
  async fetch(request) {
    const publicUrl = new URL(request.url);
    const upstreamUrl = new URL(`${publicUrl.pathname}${publicUrl.search}`, upstreamOrigin);
    const headers = new Headers(request.headers);
    const origin = headers.get("origin");
    const referer = headers.get("referer");
    if (origin === publicUrl.origin) headers.set("origin", upstreamOrigin);
    if (referer?.startsWith(publicUrl.origin)) headers.set("referer", `${upstreamOrigin}${referer.slice(publicUrl.origin.length)}`);
    headers.set("x-forwarded-host", upstreamHost);
    headers.set("x-forwarded-proto", "https");

    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
    const responseHeaders = new Headers(response.headers);
    const location = responseHeaders.get("location");
    if (location?.startsWith(upstreamOrigin)) {
      responseHeaders.set("location", `${publicUrl.origin}${location.slice(upstreamOrigin.length)}`);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
