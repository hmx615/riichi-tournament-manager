/**
 * 运势（近况运气）统计口径
 *
 * 只统计"和技术选择无关、并且能算出期望值"的维度，用"实际 − 期望"的 z 值衡量：
 *
 * - 发牌运气：起手 13 张里的宝牌 / 赤牌张数、起手向听。
 * - 进程运气：摸到的宝牌 / 赤牌、立直未和时待牌被对手握住的张数、里宝、一发。
 * - 对攻运气：有人和牌时，按各自待牌枚数算出期望胜率，与实际谁和牌比较。
 *
 * 期望值来自牌山构成（34 种 × 4 张、其中赤 5 共 3 张、开局翻开 1 张宝牌指示牌），
 * 已用全部 1036 个小局标定，见 docs.md。
 */

import { tileIndexFromCode, winningTileIndexes } from "./riichi-wait";

const TILE_KIND_COUNT = 34;
const DORA_COPIES = 4;
const RED_FIVE_COUNT = 3;
/** 136 张去掉开局翻开的那张宝牌指示牌。 */
const UNSEEN_TILE_POOL = 135;
const RED_FIVE_CODES: Record<number, number> = { 51: 15, 52: 25, 53: 35 };
const INITIAL_HAND_SIZE = 13;

/** 立直和了一手牌 14 张，里宝指示牌只有 1 张，命中期望 = 14 × 4 / 135。 */
export const URA_DORA_EXPECTATION_PER_RIICHI_WIN = (14 * DORA_COPIES) / UNSEEN_TILE_POOL;
/** 一发率的人群基线（338 次立直和了里 74 次一发）。 */
export const IPPATSU_BASELINE = 0.1927;
/**
 * 起手向听的全量标定（4144 手）：均值 3.5755（用统计脚本自身的向听算法测得）、标准差 0.8414。
 * 均值必须和 mrc_stats.js 的口径一致，否则所有人的 z 会整体偏移。
 */
export const INITIAL_SHANTEN_BASELINE = { mean: 3.5755, sd: 0.8414 };
/**
 * 待牌被对手握住的份额修正系数。
 * 均匀假设（未见牌随机落在对手手牌与牌山里）会低估"待牌被扣"，用 1036 个小局标定后
 * 整体实测 2280 张 ÷ 模型 1808 张 ≈ 1.26，乘上它做期望校准，保证平均 z 归零。
 */
export const HELD_SHARE_CALIBRATION = 1.26;

export type LuckSample = {
  seat: 0 | 1 | 2 | 3;
  /** 起手 13 张里的宝牌张数（只按开局翻开的指示牌算）。 */
  initialDora: number;
  initialRed: number;
  initialHandSize: number;
  /** 摸到的牌里的宝牌 / 赤牌张数。 */
  drawnTiles: number;
  drawnDora: number;
  drawnRed: number;
  /** 立直但没和牌的局：对手手里握住的待牌张数与期望。 */
  riichiMissHold: number | null;
  riichiMissHoldExpected: number | null;
  riichiWin: boolean;
  riichi: boolean;
  uraDora: number;
  ippatsu: boolean;
  /** 对攻：自己的期望和牌概率与实际是否和牌。 */
  contestProbability: number | null;
  contestWon: boolean;
};

type RoundArrays = {
  firstIndicator: number;
  initialHands: number[][];
  draws: unknown[][];
  rivers: unknown[][];
};

function codesOf(meld: string) {
  return [...meld.matchAll(/\d{2}/g)].map((match) => Number(match[0]));
}

function removeTile(hand: number[], tile: number) {
  const index = hand.lastIndexOf(tile);
  if (index < 0) return false;
  hand.splice(index, 1);
  return true;
}

function readRoundArrays(round: unknown): RoundArrays | null {
  if (!Array.isArray(round) || round.length < 16) return null;
  const initialHands: number[][] = [];
  const draws: unknown[][] = [];
  const rivers: unknown[][] = [];
  for (let seat = 0; seat < 4; seat += 1) {
    const initial = round[4 + seat * 3];
    const draw = round[5 + seat * 3];
    const river = round[6 + seat * 3];
    if (!Array.isArray(initial) || !Array.isArray(draw) || !Array.isArray(river)) return null;
    initialHands.push(initial.map(Number));
    draws.push(draw);
    rivers.push(river);
  }
  const indicators = (Array.isArray(round[2]) ? round[2] : []).map(Number).filter((code) => code > 0);
  return { firstIndicator: indicators[0] ?? 0, initialHands, draws, rivers };
}

/** 宝牌指示牌对应的宝牌。 */
export function doraTileFromIndicator(code: number) {
  const suit = Math.floor(code / 10);
  const rank = code % 10;
  if (suit >= 1 && suit <= 3) return rank === 9 ? suit * 10 + 1 : code + 1;
  if (suit === 4) {
    // 风牌（東南西北）与三元牌（白發中）各自成环，不能跨组。
    if (rank >= 1 && rank <= 3) return code + 1;
    if (rank === 4) return 41;
    if (rank === 5 || rank === 6) return code + 1;
    if (rank === 7) return 45;
  }
  return code;
}

/**
 * 复现某一家的暗牌。天凤紧凑牌谱里，摸牌数组按"该家自己的巡目"排列：
 * 数字表示摸到的牌，字符串表示鸣牌（`c` 吃、`p` 碰、`m` 大明杠、`k` 加杠）；
 * 河底同下标处是该巡打出的牌（`60` 摸切、`rXX` 立直宣言牌、含 `a` 表示暗杠）。
 * 出现无法还原的内容时返回 null，交由调用方按缺失处理。
 */
export function concealedHand(arrays: RoundArrays, seat: number): number[] | null {
  const hand = arrays.initialHands[seat].slice();
  if (hand.some((code) => tileIndexFromCode(code) < 0)) return null;
  const draws = arrays.draws[seat];
  const rivers = arrays.rivers[seat];
  for (let turn = 0; turn < draws.length; turn += 1) {
    const drawn = draws[turn];
    if (typeof drawn === "number") {
      hand.push(drawn);
    } else if (typeof drawn === "string") {
      const codes = codesOf(drawn);
      const letter = /[cpkma]/.exec(drawn);
      if (!letter || codes.length < 3) return null;
      const kind = letter[0];
      if (kind === "c" || kind === "p" || kind === "m") {
        // 字母紧跟着的那张是从牌河拿的，其余的来自手牌。
        const called = codesOf(drawn.slice(0, letter.index)).length;
        codes.forEach((code, index) => {
          if (index !== called) removeTile(hand, code);
        });
      } else if (kind !== "k") {
        return null;
      }
    } else {
      return null;
    }

    const entry = rivers[turn];
    if (entry === undefined) continue;
    if (typeof entry === "number") {
      if (entry === 0) return null;
      const tile = entry === 60 ? (typeof drawn === "number" ? drawn : null) : entry;
      if (tile === null || !removeTile(hand, tile)) return null;
      continue;
    }
    if (typeof entry === "string" && entry.startsWith("r")) {
      if (!removeTile(hand, Number(entry.slice(1)))) return null;
      continue;
    }
    if (typeof entry === "string" && entry.includes("a")) {
      for (const code of codesOf(entry)) if (!removeTile(hand, code)) return null;
      continue;
    }
    return null;
  }
  return hand;
}

/** 按 0=1m … 33=中 统计牌的张数。 */
function countsOf(tiles: number[]) {
  const counts = Array<number>(TILE_KIND_COUNT).fill(0);
  for (const tile of tiles) {
    const index = tileIndexFromCode(tile);
    if (index >= 0) counts[index] += 1;
  }
  return counts;
}

/** 全场已经明示的牌：四家河底（含被鸣走的牌不影响）、副露与宝牌指示牌。 */
function visibleCounts(arrays: RoundArrays) {
  const counts = Array<number>(TILE_KIND_COUNT).fill(0);
  const add = (tiles: number[]) => {
    for (const tile of tiles) {
      const index = tileIndexFromCode(tile);
      if (index >= 0) counts[index] += 1;
    }
  };
  for (let seat = 0; seat < 4; seat += 1) {
    const river = arrays.rivers[seat];
    for (const entry of river) {
      if (typeof entry === "number") {
        if (entry !== 0 && entry !== 60) add([entry]);
        continue;
      }
      if (typeof entry === "string") add(codesOf(entry));
    }
    for (const drawn of arrays.draws[seat]) {
      if (typeof drawn === "string") add(codesOf(drawn));
    }
  }
  if (arrays.firstIndicator > 0) add([arrays.firstIndicator]);
  return counts;
}

function isTenpai(hand: number[] | null) {
  if (!hand || hand.length % 3 !== 1) return false;
  return winningTileIndexes(hand).length > 0;
}

/**
 * 一局里每个座位的运气样本。无法可靠复原手牌时返回 null。
 */
export function luckSamplesFromRound(round: unknown): LuckSample[] | null {
  const arrays = readRoundArrays(round);
  if (!arrays) return null;
  const results = (Array.isArray(round) ? round : []).slice(16).filter((item) => Array.isArray(item)) as unknown[][];
  const wins = results
    .filter((result) => result[0] === "和了")
    .map((result) => result[2] as unknown[])
    .filter((win): win is unknown[] => Array.isArray(win));
  const winnerSeats = new Set(wins.map((win) => Number(win[0])));

  const hands = [0, 1, 2, 3].map((seat) => concealedHand(arrays, seat));
  if (hands.some((hand) => hand === null)) return null;
  const concealed = hands as number[][];

  // 和牌者：自摸和牌时手里多一张和牌张，去掉它才能算待牌。
  const waitHands = concealed.map((hand, seat) => {
    if (!winnerSeats.has(seat)) return hand.slice();
    const lastDraw = arrays.draws[seat][arrays.draws[seat].length - 1];
    const byTsumo = wins.some((win) => Number(win[0]) === seat && Number(win[1]) === seat);
    return byTsumo && typeof lastDraw === "number" ? hand.filter((tile, index) => index !== hand.lastIndexOf(lastDraw)) : hand.slice();
  });

  const visible = visibleCounts(arrays);
  const opponentTiles = concealed.reduce((sum, hand, seat) => (winnerSeats.has(seat) ? sum : sum + hand.length), 0);
  // 未见的牌 = 136 − 四家手牌 − 已明示的河底/副露/指示牌，即王牌 + 未摸完的牌山。
  const wallTiles = Math.max(0, 136 - concealed.reduce((sum, hand) => sum + hand.length, 0) - visible.reduce((sum, count) => sum + count, 0));
  const opponentShare = opponentTiles + wallTiles > 0
    ? (opponentTiles / (opponentTiles + wallTiles)) * HELD_SHARE_CALIBRATION
    : 0;

  const contestWaiting = waitHands.map((hand) => (isTenpai(hand) ? winningTileIndexes(hand) : []));
  const contestRemaining = contestWaiting.map((waits) => waits.reduce((sum, index) => sum + Math.max(0, DORA_COPIES - visible[index]), 0));
  const contestTotal = contestRemaining.reduce((sum, value) => sum + value, 0);

  const doraTile = arrays.firstIndicator > 0 ? doraTileFromIndicator(arrays.firstIndicator) : null;
  const doraIndex = doraTile ? tileIndexFromCode(doraTile) : -1;

  return [0, 1, 2, 3].map((seat) => {
    const seatId = seat as 0 | 1 | 2 | 3;
    const initialHand = arrays.initialHands[seat];
    const drawnNumbers = arrays.draws[seat].filter((value): value is number => typeof value === "number");
    const riichi = arrays.rivers[seat].some((entry) => typeof entry === "string" && entry.startsWith("r"));
    const riichiWin = riichi && winnerSeats.has(seat);
    const win = wins.find((item) => Number(item[0]) === seat);
    // 和了记录形如 [和了者, 放铳者, 点数, 符翻, 役…]，役种从第 5 项开始。
    const labels = win ? win.slice(4).map(String) : [];
    const uraMatch = labels.map((label) => label.match(/裏ドラ\((\d+)飜\)/)).find(Boolean);

    const counts = countsOf(waitHands[seat]);
    const unseenWaits = contestWaiting[seat].reduce((sum, index) => sum + Math.max(0, DORA_COPIES - counts[index] - visible[index]), 0);
    // 立直局（含和牌的那一手）都算：只看"立直没和"的样本会被"待牌被扣住才和不了"这件事本身污染。
    const held = riichi
      ? contestWaiting[seat].reduce((sum, index) => {
        const inOpponents = concealed.reduce((total, hand, handSeat) => (handSeat === seat ? total : total + hand.filter((tile) => tileIndexFromCode(tile) === index).length), 0);
        return sum + inOpponents;
      }, 0)
      : null;

    return {
      seat: seatId,
      initialDora: doraIndex < 0 ? 0 : initialHand.filter((tile) => tileIndexFromCode(tile) === doraIndex).length,
      initialRed: initialHand.filter((tile) => RED_FIVE_CODES[tile] !== undefined).length,
      initialHandSize: initialHand.length,
      drawnTiles: drawnNumbers.length,
      drawnDora: doraIndex < 0 ? 0 : drawnNumbers.filter((tile) => tileIndexFromCode(tile) === doraIndex).length,
      drawnRed: drawnNumbers.filter((tile) => RED_FIVE_CODES[tile] !== undefined).length,
      riichiMissHold: held,
      riichiMissHoldExpected: held === null ? null : unseenWaits * opponentShare,
      riichiWin,
      riichi,
      uraDora: uraMatch ? Number(uraMatch[1]) : 0,
      ippatsu: labels.some((label) => label.includes("一発")),
      // 对攻只统计"有人和牌"的局，流局不计入。
      contestProbability: wins.length > 0 && contestTotal > 0 && contestRemaining[seat] > 0 ? contestRemaining[seat] / contestTotal : null,
      contestWon: winnerSeats.has(seat),
    } satisfies LuckSample;
  });
}

export type LuckDimension = {
  key: string;
  label: string;
  /** 实际值与期望值，按维度各自的单位。 */
  actual: number;
  expected: number;
  unit: string;
  /** 样本量（局数 / 立直数 / 对攻次数…）。 */
  sampleCount: number;
  z: number;
  weight: number;
};

export type LuckLevel = "绝好调" | "好调" | "平平无奇" | "恶调" | "极恶调";

export type LuckReport = {
  level: LuckLevel;
  score: number;
  dimensions: LuckDimension[];
  windowMatches: number;
  windowRounds: number;
};

/** 同一个人物的两套视图：近期窗口与全部牌谱。 */
export type LuckViews = {
  recent: LuckReport;
  allTime: LuckReport;
};

/**
 * 分档阈值。综合分数是 9 个维度 z 的加权平均，方差天然小于单个维度，
 * 20 半庄窗口下实测分布约为 ±0.25 个标准差，所以用 0.45 / 0.18 切五档
 * （直接用单维度的 ±1.0 / ±0.35 会让几乎所有人都是"平平无奇"）。
 */
const LEVELS: Array<{ min: number; level: LuckLevel }> = [
  { min: 0.45, level: "绝好调" },
  { min: 0.18, level: "好调" },
  { min: -0.18, level: "平平无奇" },
  { min: -0.45, level: "恶调" },
  { min: Number.NEGATIVE_INFINITY, level: "极恶调" },
];

/** 样本少时把 z 向 0 收缩，避免 3 次对攻就报"绝好调"。 */
const SHRINKAGE = 25;

function poissonZ(actual: number, expected: number) {
  if (expected <= 0) return 0;
  return (actual - expected) / Math.sqrt(expected);
}

function bernoulliZ(successes: number, trials: number, baseline: number) {
  const variance = trials * baseline * (1 - baseline);
  if (variance <= 0) return 0;
  return (successes - trials * baseline) / Math.sqrt(variance);
}

export function luckLevelFromScore(score: number): LuckLevel {
  return (LEVELS.find((entry) => score >= entry.min) ?? LEVELS[LEVELS.length - 1]).level;
}

function shrink(z: number, sampleCount: number) {
  return z * (sampleCount / (sampleCount + SHRINKAGE));
}

export function summarizeLuck(samples: LuckSample[], context: {
  windowMatches: number;
  windowRounds: number;
  /** 窗口内平均起手向听与参与统计的手数（由调用方用统计脚本累计）。 */
  initialShantenMean: number;
  initialShantenHands: number;
}): LuckReport {
  const sum = (pick: (sample: LuckSample) => number) => samples.reduce((total, sample) => total + pick(sample), 0);
  const riichiWins = samples.filter((sample) => sample.riichiWin);
  const holdSamples = samples.filter((sample) => sample.riichiMissHold !== null);
  const contests = samples.filter((sample) => sample.contestProbability !== null);

  const initialDora = sum((sample) => sample.initialDora);
  const initialRed = sum((sample) => sample.initialRed);
  const initialTiles = sum((sample) => sample.initialHandSize);
  const drawnTiles = sum((sample) => sample.drawnTiles);
  const drawnDora = sum((sample) => sample.drawnDora);
  const drawnRed = sum((sample) => sample.drawnRed);
  const ura = sum((sample) => sample.uraDora);
  const ippatsu = sum((sample) => (sample.ippatsu ? 1 : 0));
  const hold = sum((sample) => sample.riichiMissHold ?? 0);

  const doraExpected = (initialTiles + drawnTiles) * (DORA_COPIES / UNSEEN_TILE_POOL);
  const redExpected = (initialTiles + drawnTiles) * (RED_FIVE_COUNT / UNSEEN_TILE_POOL);
  const uraExpected = riichiWins.length * URA_DORA_EXPECTATION_PER_RIICHI_WIN;
  const holdExpected = sum((sample) => sample.riichiMissHoldExpected ?? 0);
  const contestExpected = sum((sample) => sample.contestProbability ?? 0);
  const contestWins = contests.filter((sample) => sample.contestWon).length;
  const contestVariance = contests.reduce((total, sample) => total + (sample.contestProbability ?? 0) * (1 - (sample.contestProbability ?? 0)), 0);
  // 起手向听越低越好，取负号。
  const shantenZ = context.initialShantenHands > 0
    ? -(context.initialShantenMean - INITIAL_SHANTEN_BASELINE.mean) / (INITIAL_SHANTEN_BASELINE.sd / Math.sqrt(context.initialShantenHands))
    : 0;

  const dimensions: LuckDimension[] = [
    {
      key: "initial-shanten",
      label: "起手向听",
      actual: context.initialShantenMean,
      expected: INITIAL_SHANTEN_BASELINE.mean,
      unit: "向听",
      sampleCount: context.initialShantenHands,
      z: shrink(shantenZ, context.initialShantenHands),
      weight: 20,
    },
    {
      key: "initial-dora",
      label: "配牌宝牌",
      actual: initialDora,
      expected: initialTiles * (DORA_COPIES / UNSEEN_TILE_POOL),
      unit: "张",
      sampleCount: initialTiles,
      z: shrink(poissonZ(initialDora, initialTiles * (DORA_COPIES / UNSEEN_TILE_POOL)), initialTiles),
      weight: 10,
    },
    {
      key: "initial-red",
      label: "配牌赤牌",
      actual: initialRed,
      expected: initialTiles * (RED_FIVE_COUNT / UNSEEN_TILE_POOL),
      unit: "张",
      sampleCount: initialTiles,
      z: shrink(poissonZ(initialRed, initialTiles * (RED_FIVE_COUNT / UNSEEN_TILE_POOL)), initialTiles),
      weight: 5,
    },
    {
      key: "drawn-dora",
      label: "摸牌宝牌",
      actual: drawnDora,
      expected: drawnTiles * (DORA_COPIES / UNSEEN_TILE_POOL),
      unit: "张",
      sampleCount: drawnTiles,
      z: shrink(poissonZ(drawnDora, drawnTiles * (DORA_COPIES / UNSEEN_TILE_POOL)), drawnTiles),
      weight: 10,
    },
    {
      key: "drawn-red",
      label: "摸牌赤牌",
      actual: drawnRed,
      expected: doraExpected > 0 ? drawnTiles * (RED_FIVE_COUNT / UNSEEN_TILE_POOL) : 0,
      unit: "张",
      sampleCount: drawnTiles,
      z: shrink(poissonZ(drawnRed, drawnTiles * (RED_FIVE_COUNT / UNSEEN_TILE_POOL)), drawnTiles),
      weight: 5,
    },
    {
      key: "wait-held",
      label: "待牌被扣",
      actual: hold,
      expected: holdExpected,
      unit: "张",
      sampleCount: holdSamples.length,
      // 被扣得越多越背，所以取负号。
      z: shrink(-poissonZ(hold, holdExpected), holdSamples.length),
      weight: 10,
    },
    {
      key: "ura",
      label: "里宝",
      actual: ura,
      expected: uraExpected,
      unit: "飜",
      sampleCount: riichiWins.length,
      z: shrink(poissonZ(ura, uraExpected), riichiWins.length),
      weight: 10,
    },
    {
      key: "ippatsu",
      label: "一发",
      actual: ippatsu,
      expected: riichiWins.length * IPPATSU_BASELINE,
      unit: "次",
      sampleCount: riichiWins.length,
      z: shrink(bernoulliZ(ippatsu, riichiWins.length, IPPATSU_BASELINE), riichiWins.length),
      weight: 5,
    },
    {
      key: "contest",
      label: "对攻",
      actual: contestWins,
      expected: contestExpected,
      unit: "次",
      sampleCount: contests.length,
      z: shrink(contestVariance > 0 ? (contestWins - contestExpected) / Math.sqrt(contestVariance) : 0, contests.length),
      weight: 30,
    },
  ];

  const totalWeight = dimensions.reduce((total, dimension) => total + dimension.weight, 0);
  const score = dimensions.reduce((total, dimension) => total + dimension.z * dimension.weight, 0) / totalWeight;
  return {
    level: luckLevelFromScore(score),
    score,
    dimensions,
    windowMatches: context.windowMatches,
    windowRounds: context.windowRounds,
  };
}
