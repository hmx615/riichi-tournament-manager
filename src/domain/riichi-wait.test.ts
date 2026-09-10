import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isWinningHand,
  riichiWaitSamples,
  summarizeRiichiWaitSamples,
  winningTileIndexes,
  type RiichiWaitSample,
} from "./riichi-wait";

const tileNames: Record<string, number> = {
  "1m": 11, "2m": 12, "3m": 13, "4m": 14, "5m": 15, "6m": 16, "7m": 17, "8m": 18, "9m": 19,
  "1p": 21, "2p": 22, "3p": 23, "4p": 24, "5p": 25, "6p": 26, "7p": 27, "8p": 28, "9p": 29,
  "1s": 31, "2s": 32, "3s": 33, "4s": 34, "5s": 35, "6s": 36, "7s": 37, "8s": 38, "9s": 39,
  "1z": 41, "2z": 42, "3z": 43, "4z": 44, "5z": 45, "6z": 46, "7z": 47,
};

function tiles(...names: string[]) {
  return names.map((name) => tileNames[name]);
}

/** 把 0…33 下标还原成便于阅读的牌名。 */
function waitNames(indexes: number[]) {
  const order = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "7z"];
  return indexes.map((index) => order[index]);
}

/**
 * 构造一局天凤紧凑牌谱：`[局信息, 点数, 宝牌指示牌, 里宝牌, 四家初始手牌, 四家摸牌, 四家河底, 结果]`。
 * 河底中 `60` 表示摸切，`0` 表示杠占位，`rXX` 表示立直宣言牌，`…a…` 表示暗杠。
 */
function compactRound({
  hands,
  draws,
  rivers,
  dora = [],
}: {
  hands: number[][];
  draws: unknown[][];
  rivers: unknown[][];
  dora?: number[];
}) {
  const round: unknown[] = [[0, 0, 0], [25000, 25000, 25000, 25000], dora, []];
  for (let seat = 0; seat < 4; seat += 1) round.push(hands[seat], draws[seat] ?? [], rivers[seat] ?? []);
  round.push(["流局", [0, 0, 0, 0]]);
  return round;
}

const fillerHand = tiles("1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "5z", "6z", "7z", "5m");

describe("riichi wait shape", () => {
  it("recognises a two-sided wait", () => {
    const hand = tiles("2m", "3m", "4m", "5m", "6m", "7m", "7p", "8p", "9p", "3s", "3s", "7s", "8s");
    expect(waitNames(winningTileIndexes(hand))).toEqual(["6s", "9s"]);
    expect(isWinningHand([...hand, tileNames["6s"]])).toBe(true);
    expect(isWinningHand([...hand, tileNames["7s"]])).toBe(false);
  });

  it("recognises a three-sided wait", () => {
    const hand = tiles("2m", "3m", "4m", "5m", "6m", "7m", "9p", "9p", "3s", "4s", "5s", "6s", "7s");
    expect(waitNames(winningTileIndexes(hand))).toEqual(["2s", "5s", "8s"]);
  });

  it("recognises a single wait and a twin-pair wait", () => {
    expect(waitNames(winningTileIndexes(tiles("2m", "3m", "4m", "5m", "6m", "7m", "7p", "8p", "9p", "6s", "7s", "8s", "5z")))).toEqual(["5z"]);
    expect(waitNames(winningTileIndexes(tiles("1m", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "7p", "8p", "9p", "3s", "3s")))).toEqual(["1m", "3s"]);
  });

  it("recognises seven pairs and thirteen orphans", () => {
    expect(waitNames(winningTileIndexes(tiles("1m", "1m", "3m", "3m", "5p", "5p", "7p", "7p", "9s", "9s", "1z", "1z", "3z")))).toEqual(["3z"]);
    expect(waitNames(winningTileIndexes(tiles("1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "7z")))).toEqual(["1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "7z"]);
  });
});

describe("riichi wait samples", () => {
  it("reconstructs a tsumogiri riichi and counts remaining tiles", () => {
    const hand = tiles("1m", "2m", "3m", "4m", "5m", "6m", "9p", "9p", "3s", "4s", "5s", "6s", "7s");
    const round = compactRound({
      hands: [hand, fillerHand, fillerHand.slice(), fillerHand.slice()],
      draws: [[tileNames["1p"]], [], [], []],
      rivers: [["r21"], [], [], []],
      dora: [tileNames["4m"]],
    });
    const samples = riichiWaitSamples([round]);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      seat: 0,
      waitTileTypeCount: 3,
      // 自己手牌里已有一张 5s，因此剩余为 4 + 3 + 4。
      remainingWaitTileCount: 11,
      isMultiSide: true,
      isGoodShape: true,
    });
    expect(waitNames(samples[0].waitTileIndexes)).toEqual(["2s", "5s", "8s"]);
  });

  it("counts tiles already visible on the table at the riichi moment", () => {
    const hand = tiles("1m", "2m", "3m", "4m", "5m", "6m", "9p", "9p", "3s", "4s", "5s", "6s", "7s");
    const round = compactRound({
      hands: [hand, fillerHand.slice(), fillerHand.slice(), fillerHand.slice()],
      // 立直发生在第 2 巡；自亲先手，此时其他三家各已打出第 1 张牌。
      draws: [[tileNames["1p"], tileNames["7z"]], [], [], []],
      rivers: [[60, "r47"], [tileNames["2s"]], [tileNames["8s"]], []],
      // 宝牌指示牌 5s 本身也是待牌，属于已见牌。
      dora: [tileNames["5s"]],
    });
    const samples = riichiWaitSamples([round]);
    // 2s、8s 各已见 1 张，5s 已见自己手牌 1 张与宝牌指示牌 1 张，剩余 3 + 2 + 3 = 8。
    expect(samples[0].remainingWaitTileCount).toBe(8);
    expect(samples[0].isGoodShape).toBe(true);
  });

  it("reconstructs a hand with an ankan", () => {
    const hand = tiles("2s", "2s", "2s", "3m", "4m", "5m", "6p", "7p", "8p", "7s", "8s", "9p", "9p");
    expect(hand).toHaveLength(13);
    const round = compactRound({
      hands: [hand, fillerHand.slice(), fillerHand.slice(), fillerHand.slice()],
      draws: [[tileNames["2s"], tileNames["1m"]], [], [], []],
      // 暗杠 2s（暗杠牌在山河中以 4 张明示），随后摸 1m 并立直。
      rivers: [["323232a32", "r11"], [], [], []],
    });
    const samples = riichiWaitSamples([round]);
    expect(samples).toHaveLength(1);
    expect(waitNames(samples[0].waitTileIndexes)).toEqual(["6s", "9s"]);
  });

  it("skips rounds without a riichi declaration", () => {
    const round = compactRound({
      hands: [fillerHand.slice(), fillerHand.slice(), fillerHand.slice(), fillerHand.slice()],
      draws: [[tileNames["1p"]], [], [], []],
      rivers: [[tileNames["1p"]], [], [], []],
    });
    expect(riichiWaitSamples([round])).toEqual([]);
  });
});

describe("riichi wait summary", () => {
  const sample = (isMultiSide: boolean, isGoodShape: boolean): RiichiWaitSample => ({
    seat: 0,
    waitTileTypeCount: isMultiSide ? 2 : 1,
    waitTileIndexes: [0],
    remainingWaitTileCount: isGoodShape ? 6 : 4,
    isMultiSide,
    isGoodShape,
  });

  it("reports rates over reconstructable riichi hands", () => {
    expect(summarizeRiichiWaitSamples([sample(true, true), sample(true, false), sample(false, false), sample(true, false)]))
      .toEqual({
        riichiCount: 4,
        multiSideCount: 3,
        goodShapeCount: 1,
        multiSideRate: 0.75,
        goodShapeRate: 0.25,
      });
  });

  it("keeps missing values instead of inventing them", () => {
    expect(summarizeRiichiWaitSamples([])).toMatchObject({ riichiCount: 0, multiSideRate: null, goodShapeRate: null });
  });
});

describe("fixed regression logs", () => {
  const cacheDirectory = path.join(process.cwd(), "reference", "1st-xrc-29", "cache");

  it("reconstructs every riichi hand in the fixed cache", () => {
    const rounds: unknown[][] = [];
    let riichiDeclarations = 0;
    for (const file of fs.readdirSync(cacheDirectory)) {
      if (!file.endsWith(".json")) continue;
      const document = JSON.parse(fs.readFileSync(path.join(cacheDirectory, file), "utf8")) as { log?: unknown[][] };
      if (!Array.isArray(document.log)) continue;
      for (const round of document.log) {
        if (!Array.isArray(round) || round.length < 16) continue;
        rounds.push(round);
        for (let seat = 0; seat < 4; seat += 1) {
          const river = round[6 + seat * 3];
          if (Array.isArray(river) && river.some((entry) => typeof entry === "string" && entry.startsWith("r"))) riichiDeclarations += 1;
        }
      }
    }
    const samples = riichiWaitSamples(rounds);
    expect(riichiDeclarations).toBeGreaterThan(0);
    expect(samples).toHaveLength(riichiDeclarations);
    expect(samples.every((item) => item.waitTileIndexes.length > 0)).toBe(true);
  });
});
