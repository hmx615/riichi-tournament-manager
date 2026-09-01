import { describe, expect, it } from "vitest";
import { normalizeMajsoulJson } from "./majsoul-json";

function completedHand() {
  return [
    [7, 0, 0],
    [15800, 30600, 11900, 41700],
    [19, 51],
    [],
    [], [], [],
    [], [], [],
    [], [], [],
    [], [], [],
    ["和了", [1300, 0, 0, -1300], [0, 3, 0, "40符1飜1300点", "役牌 白(1飜)"]],
  ];
}

describe("Ricochet Majsoul JSON", () => {
  it("normalizes a /6-style export without ref or sc", async () => {
    const log = await normalizeMajsoulJson(JSON.stringify({
      title: ["玉の間四人南", "Wed, 19 Jan 2022 11:33:29 GMT"],
      name: ["这是什么时候的", "Traaaaa", "LUCIUS", "フィッシャー"],
      rule: { disp: "玉の間四人南", aka53: 1 },
      log: [completedHand()],
    }));

    expect(log.ref).toMatch(/^majsoul-[a-f0-9]{32}$/);
    expect(log.sc).toEqual([17100, 2, 30600, 3, 11900, 1, 40400, 4]);
    expect(log.playedAt).toBe("2022-01-19T11:33:29.000Z");
    expect(log.sourcePlatform).toBe("majsoul");
  });

  it("uses a content-stable ID and preserves supplied result scores", async () => {
    const source = {
      name: ["A", "B", "C", "D"],
      sc: [17100, -18, 30600, 16, 11900, -34, 40400, 36],
      log: [completedHand()],
    };
    const compact = await normalizeMajsoulJson(JSON.stringify(source));
    const formatted = await normalizeMajsoulJson(JSON.stringify(source, null, 2));

    expect(compact.ref).toBe(formatted.ref);
    expect(compact.sc).toEqual(source.sc);
  });

  it("rejects files without four player names", async () => {
    await expect(normalizeMajsoulJson(JSON.stringify({ name: ["A"], log: [completedHand()] })))
      .rejects.toThrow("缺少四家昵称");
  });
});
