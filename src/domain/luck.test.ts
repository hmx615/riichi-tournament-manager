import { describe, expect, it } from "vitest";
import {
  concealedHand,
  doraTileFromIndicator,
  luckLevelFromScore,
  luckSamplesFromRound,
  summarizeLuck,
  type LuckSample,
} from "./luck";

const RED_5M = 51;
const tiles = {
  "1m": 11, "2m": 12, "3m": 13, "4m": 14, "5m": 15, "6m": 16, "7m": 17, "8m": 18, "9m": 19,
  "1p": 21, "2p": 22, "3p": 23, "4p": 24, "5p": 25, "6p": 26, "7p": 27, "8p": 28, "9p": 29,
  "1s": 31, "2s": 32, "3s": 33, "4s": 34, "5s": 35, "6s": 36, "7s": 37, "8s": 38, "9s": 39,
  "1z": 41, "2z": 42, "3z": 43, "4z": 44, "5z": 45, "6z": 46, "7z": 47,
} as const;

function hand(...names: Array<keyof typeof tiles>) {
  return names.map((name) => tiles[name]);
}

/** 构造一局：`[局信息, 点数, 宝牌指示牌, 里宝牌, 四家初始手牌, 四家摸牌, 四家河底, 结果…]`。 */
function round({
  hands,
  draws = [[], [], [], []],
  rivers = [[], [], [], []],
  indicator = 0,
  results = [["流局", [0, 0, 0, 0]]],
}: {
  hands: number[][];
  draws?: unknown[][];
  rivers?: unknown[][];
  indicator?: number;
  results?: unknown[];
}) {
  const value: unknown[] = [[0, 0, 0], [25000, 25000, 25000, 25000], indicator ? [indicator] : [], []];
  for (let seat = 0; seat < 4; seat += 1) value.push(hands[seat], draws[seat] ?? [], rivers[seat] ?? []);
  value.push(...results);
  return value;
}

/** 13 张互不搭的牌，保证不是听牌。 */
const isolated = hand("1m", "4m", "7m", "1p", "4p", "7p", "1s", "4s", "7s", "1z", "3z", "5z", "7z");
/** 123m 456m 789m 123p + 5p 单骑。 */
const tanki5p = hand("1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "5p");
/** 111m 222m 333m 444m + 5z 单骑（唯一待牌）。 */
const tanki5z = hand("1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m", "5z");

describe("宝牌指示牌", () => {
  it("按天凤规则顺移", () => {
    expect(doraTileFromIndicator(tiles["4m"])).toBe(tiles["5m"]);
    expect(doraTileFromIndicator(tiles["9m"])).toBe(tiles["1m"]);
    expect(doraTileFromIndicator(tiles["9s"])).toBe(tiles["1s"]);
    // 三元牌回到白，风牌回到东，不能跨组顺移。
    expect(doraTileFromIndicator(tiles["7z"])).toBe(tiles["5z"]);
    expect(doraTileFromIndicator(tiles["4z"])).toBe(tiles["1z"]);
    expect(doraTileFromIndicator(tiles["6z"])).toBe(tiles["7z"]);
  });
});

describe("手牌复现", () => {
  it("摸切后回到初始手牌", () => {
    const arrays = {
      firstIndicator: tiles["4m"],
      initialHands: [tanki5p, isolated, isolated, isolated],
      draws: [[tiles["9p"]], [], [], []],
      rivers: [[60], [], [], []],
    };
    expect(concealedHand(arrays, 0)).toEqual(tanki5p);
  });

  it("吃牌只从手里拿走真正出的两张", () => {
    const before = hand("1s", "2s", "3s", "5p", "5p", "6p", "7p", "8p", "9p", "1z", "2z", "3z", "4z");
    const arrays = {
      firstIndicator: tiles["4m"],
      initialHands: [before, isolated, isolated, isolated],
      // 吃 3s（牌河里的那张），手里出 1s、2s；随后打 1z。
      draws: [["c333132"], [], [], []],
      rivers: [[tiles["1z"]], [], [], []],
    };
    expect(concealedHand(arrays, 0)).toEqual(hand("3s", "5p", "5p", "6p", "7p", "8p", "9p", "2z", "3z", "4z"));
  });
});

describe("运气样本", () => {
  it("统计起手宝牌与赤牌", () => {
    const withRed: number[] = hand("1m", "2m", "3m", "4m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "5p", "9s");
    withRed[0] = RED_5M;
    const samples = luckSamplesFromRound(round({
      hands: [withRed, isolated.slice(), isolated.slice(), isolated.slice()],
      indicator: tiles["4m"],
    }));
    expect(samples).not.toBeNull();
    const mine = samples![0];
    // 赤 5m 既是宝牌（指示牌 4m）也是赤牌。
    expect(mine.initialDora).toBe(1);
    expect(mine.initialRed).toBe(1);
    expect(mine.initialHandSize).toBe(13);
  });

  it("按待牌枚数分配对攻期望（单骑对单骑）", () => {
    const samples = luckSamplesFromRound(round({
      hands: [tanki5p, isolated.slice(), tanki5z, isolated.slice()],
      draws: [[], [tiles["5p"]], [], []],
      rivers: [[], [tiles["5p"]], [], []],
      results: [["和了", [1000, -1000, 0, 0], [0, 1, 1000, "30符1飜", "断幺九(1飜)"]]],
    }));
    expect(samples).not.toBeNull();
    const [seat0, seat1, seat2, seat3] = samples!;
    // 5p 已打出 1 张，自己待牌剩 3 枚；对手单骑 5z 剩 4 枚。
    expect(seat0.contestProbability).toBeCloseTo(3 / 7, 5);
    expect(seat0.contestWon).toBe(true);
    expect(seat2.contestProbability).toBeCloseTo(4 / 7, 5);
    expect(seat2.contestWon).toBe(false);
    expect(seat1.contestProbability).toBeNull();
    expect(seat3.contestProbability).toBeNull();
  });

  it("立直未和时统计对手扣住的待牌", () => {
    const holder = hand("5p", "5p", "5p", "1m", "4m", "7m", "1p", "4p", "7p", "1s", "4s", "7s", "1z");
    const samples = luckSamplesFromRound(round({
      hands: [tanki5p, holder, isolated.slice(), isolated.slice()],
      draws: [[tiles["9p"]], [], [], []],
      rivers: [["r29"], [], [], []],
    }));
    expect(samples).not.toBeNull();
    const mine = samples![0];
    expect(mine.riichi).toBe(true);
    expect(mine.riichiWin).toBe(false);
    // 对手手里握着 3 张 5p，自己正好听 5p。
    expect(mine.riichiMissHold).toBe(3);
    expect(mine.riichiMissHoldExpected).toBeGreaterThan(0);
  });
});

describe("运势汇总", () => {
  const base: LuckSample = {
    seat: 0,
    initialDora: 0,
    initialRed: 0,
    initialHandSize: 13,
    drawnTiles: 0,
    drawnDora: 0,
    drawnRed: 0,
    riichiMissHold: null,
    riichiMissHoldExpected: null,
    riichiWin: false,
    riichi: false,
    uraDora: 0,
    ippatsu: false,
    contestProbability: null,
    contestWon: false,
  };
  const context = { windowMatches: 1, windowRounds: 1, initialShantenMean: 3.5755, initialShantenHands: 4 };

  it("对攻残差零和：一胜一负不加分", () => {
    const report = summarizeLuck([
      { ...base, contestProbability: 0.5, contestWon: true },
      { ...base, seat: 1, contestProbability: 0.5, contestWon: false },
    ], context);
    expect(report.dimensions.find((item) => item.key === "contest")?.z).toBe(0);
  });

  it("弱旅赢了强敌时给正分", () => {
    // 对攻残差是零和的，所以只看某一个玩家自己的样本。
    const report = summarizeLuck(Array.from({ length: 20 }, () => ({ ...base, contestProbability: 0.2, contestWon: true })), context);
    expect(report.dimensions.find((item) => item.key === "contest")!.z).toBeGreaterThan(0);
    expect(report.score).toBeGreaterThan(0);
  });

  it("样本极少时向平平无奇收缩", () => {
    const report = summarizeLuck([{ ...base, contestProbability: 0.1, contestWon: true }], {
      ...context, initialShantenHands: 13,
    });
    expect(report.dimensions.find((item) => item.key === "contest")!.z).toBeLessThan(1);
    expect(report.level).toBe("平平无奇");
  });

  it("分档阈值", () => {
    expect(luckLevelFromScore(0.5)).toBe("绝好调");
    expect(luckLevelFromScore(0.2)).toBe("好调");
    expect(luckLevelFromScore(0)).toBe("平平无奇");
    expect(luckLevelFromScore(-0.2)).toBe("恶调");
    expect(luckLevelFromScore(-0.5)).toBe("极恶调");
  });

  it("起手向听越低越好，方向不能反", () => {
    const lucky = summarizeLuck([base], { windowMatches: 1, windowRounds: 1, initialShantenMean: 3.4, initialShantenHands: 200 });
    const unlucky = summarizeLuck([base], { windowMatches: 1, windowRounds: 1, initialShantenMean: 3.8, initialShantenHands: 200 });
    expect(lucky.dimensions[0].z).toBeGreaterThan(0);
    expect(unlucky.dimensions[0].z).toBeLessThan(0);
  });
});
