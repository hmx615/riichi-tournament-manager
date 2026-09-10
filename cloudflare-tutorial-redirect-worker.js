const tutorialOrigin = "https://xuanxuan-mahjong-cases.pages.dev";

export default {
  async fetch(request) {
    const sourceUrl = new URL(request.url);
    const destination = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, tutorialOrigin);

    if (request.method === "GET" || request.method === "HEAD") {
      return Response.redirect(destination, 302);
    }

    return Response.json(
      { error: "牌例筛选站已迁移", location: destination.href },
      { status: 410, headers: { "cache-control": "no-store" } },
    );
  },
};
