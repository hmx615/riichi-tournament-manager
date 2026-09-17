import { describe, expect, it } from "vitest";
import { resolvePublicOrigin } from "./site-origin";

const fallback = "https://riichi-tournament-manager.pages.dev";

describe("resolvePublicOrigin", () => {
  it("把 pages 代理转发后的 workers.dev 主机换回对外入口", () => {
    expect(resolvePublicOrigin({ host: "riichi-tournament-manager.hmx-mahjong.workers.dev", protocol: "https", fallback })).toBe(fallback);
    expect(resolvePublicOrigin({ host: "some-thing.workers.dev", fallback })).toBe(fallback);
    expect(resolvePublicOrigin({ host: "", fallback })).toBe(fallback);
  });

  it("保留真实的对外域名与协议", () => {
    expect(resolvePublicOrigin({ host: "riichi-tournament-manager.pages.dev", protocol: "https", fallback })).toBe("https://riichi-tournament-manager.pages.dev");
    expect(resolvePublicOrigin({ host: "mj.example.com, proxy.internal", protocol: "https", fallback })).toBe("https://mj.example.com");
    expect(resolvePublicOrigin({ host: "MJ.Example.com", fallback })).toBe("https://mj.example.com");
  });

  it("本地开发保留 http 与端口", () => {
    expect(resolvePublicOrigin({ host: "localhost:3001", fallback })).toBe("http://localhost:3001");
    expect(resolvePublicOrigin({ host: "127.0.0.1:3001", fallback })).toBe("http://127.0.0.1:3001");
  });

  it("允许自定义兜底域名", () => {
    expect(resolvePublicOrigin({ host: "x.workers.dev", fallback: "https://mj.example.com/" })).toBe("https://mj.example.com");
  });
});
