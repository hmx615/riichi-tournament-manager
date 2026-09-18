import { describe, expect, it } from "vitest";
// @ts-expect-error 固定的历史统计脚本是 CommonJS，没有类型声明。
import calculator from "../../reference/1st-xrc-29/mrc_stats.js";

type Stats = Record<string, number | number[]>;
type Summary = Record<string, number | null>;

const legacy = calculator as {
  createStats(): Stats;
  addGameStats(stats: Stats, log: { sc: number[] }, seat: number): void;
  addHandStats(allStats: Record<string, Stats>, hand: unknown[], seatIdentities: string[]): void;
  finalize(stats: Stats): Summary;
};

const IDENTITIES = ["a", "b", "c", "d"];

/**
 * 构造一局天凤紧凑牌谱：`[局信息, 点数, 宝牌指示牌, 里宝牌, 四家初始手牌, 四家摸牌, 四家河底, 结果]`。
 * 河底中的 `60` 表示摸切，`rXX` 表示立直宣言牌。
 */
function round({ rivers = [[], [], [], []], results }: { rivers?: unknown[][]; results: unknown[] }) {
  const hand: unknown[] = [[0, 0, 0], [25000, 25000, 25000, 25000], [], []];
  for (let seat = 0; seat < 4; seat += 1) hand.push([], [], rivers[seat] ?? []);
  hand.push(results);
  return hand;
}

function summarize(hands: unknown[][], games = 0) {
  const allStats = Object.fromEntries(IDENTITIES.map((identity) => [identity, legacy.createStats()]));
  for (let game = 0; game < games; game += 1) {
    IDENTITIES.forEach((identity, seat) => legacy.addGameStats(allStats[identity], { sc: [30000, 1, 25000, 2, 25000, 3, 20000, 4] }, seat));
  }
  for (const hand of hands) legacy.addHandStats(allStats, hand, IDENTITIES);
  return { summary: legacy.finalize(allStats.a), stats: allStats.a };
}

describe("里宝率与平均里宝数", () => {
  it("只统计立直和了，默听和了不计入分母", () => {
    const riichiTsumo = round({
      rivers: [["r11"], [], [], []],
      results: ["和了", [8000, -2000, -2000, -4000], [0, 0, 8000, "40符3飜", "立直(1飜)", "裏ドラ(2飜)"]],
    });
    const damaRon = round({
      results: ["和了", [0, -1000, 1000, 0], [0, 2, 1000, "30符1飜", "役牌 白(1飜)"]],
    });
    const { summary } = summarize([riichiTsumo, damaRon]);
    expect(summary["立直和了"]).toBe(1);
    expect(summary["里宝率"]).toBe(1);
    expect(summary["平均里宝数"]).toBe(2);
  });

  it("立直和了没有里宝牌时里宝数为 0", () => {
    const noUra = round({
      rivers: [["r11"], [], [], []],
      results: ["和了", [1000, -1000, 0, 0], [0, 1, 1000, "30符1飜", "立直(1飜)", "裏ドラ(0飜)"]],
    });
    const { summary } = summarize([noUra]);
    expect(summary["里宝率"]).toBe(0);
    expect(summary["平均里宝数"]).toBe(0);
  });
});

describe("被炸率", () => {
  it("分子限定庄家被自摸满贯以上，分母是全部被自摸次数", () => {
    // 自亲（座次 0）连续两局被下家自摸：一次满贯 8000，一次 5000 未满贯。
    const mangan = round({ results: ["和了", [-2000, 8000, -2000, -4000], [1, 1, 8000, "子の満貫", "門前清自摸和(1飜)"]] });
    const cheap = round({ results: ["和了", [-1000, 5000, -2000, -2000], [1, 1, 5000, "30符3飜", "門前清自摸和(1飜)"]] });
    const { summary, stats } = summarize([mangan, cheap]);
    expect(stats.tsumoLossHands).toBe(2);
    expect(stats.tsumoLossDealerManganHands).toBe(1);
    expect(summary["被炸率"]).toBe(0.5);
    // 原有"被自摸次数占总局数"的口径保留在另一个字段里。
    expect(summary["被自摸率"]).toBe(1);
  });

  it("自己是子家时被自摸不计入被炸庄", () => {
    // 庄家是座次 1，座次 0 是子家。
    const hand = round({ results: ["和了", [-2000, -2000, 8000, -4000], [2, 2, 8000, "子の満貫", "門前清自摸和(1飜)"]] });
    hand[0] = [1, 0, 0];
    const { summary, stats } = summarize([hand]);
    expect(stats.tsumoLossHands).toBe(1);
    expect(stats.tsumoLossDealerManganHands).toBe(0);
    expect(summary["被炸率"]).toBe(0);
  });
});

describe("局收支", () => {
  it("按每局平均素点收支计算", () => {
    const hand = round({ results: ["和了", [0, -1000, 1000, 0], [0, 1, 1000, "30符1飜", "立直(1飜)"]] });
    // 两场半庄各一局，终局素点 30000 + 30000，起始 25000 × 2，总局数 2。
    const { summary } = summarize([hand, hand], 2);
    expect(summary["对局数"]).toBe(2);
    expect(summary["统计局数"]).toBe(2);
    expect(summary["局收支"]).toBe(5000);
  });
});
