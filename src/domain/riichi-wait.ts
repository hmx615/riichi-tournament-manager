/**
 * 立直牌形统计口径（第一版）
 *
 * - 立直多面率：立直时听牌种类数达到 `RIICHI_MULTI_SIDE_MIN_TILE_TYPES` 的立直占比。
 * - 立直好型率：立直时待牌剩余张数达到 `RIICHI_GOOD_SHAPE_MIN_REMAINING_TILES` 的立直占比。
 *   剩余张数 = Σ(4 − 自己视角可见张数)，可见范围包含自己手牌、立直瞬间已打出的四家河底、
 *   已鸣出的副露以及已翻开的宝牌指示牌。
 * - 只统计能从牌谱还原手牌的立直；无法还原的立直不进入分母，也不补造数据。
 *
 * 牌谱为天凤紧凑格式：每小局为 `[局信息, 点数, 宝牌指示牌, 里宝牌, 四家初始手牌, 四家摸牌, 四家河底, 结果…]`。
 * 河底中的 `60` 表示摸切（该张牌即同位置的摸牌），`0` 表示杠的占位，
 * `rXX` 表示立直宣言牌，`…a…` 与 `…k…` 分别表示暗杠与加杠。
 */

/** 立直多面率中“多面”的最低听牌种类数。 */
export const RIICHI_MULTI_SIDE_MIN_TILE_TYPES = 2;

/** 立直好型率中“好型”的最低待牌剩余张数。 */
export const RIICHI_GOOD_SHAPE_MIN_REMAINING_TILES = 6;

const ROUND_EVENT_STRIDE = 3;
const INITIAL_HAND_OFFSET = 4;
const DRAW_OFFSET = 5;
const RIVER_OFFSET = 6;
const TSUMOGIRI_CODE = 60;
const KAN_PLACEHOLDER_CODE = 0;
const TERMINAL_AND_HONOR_INDEXES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
const RED_FIVE_CODES: Record<number, number> = { 51: 15, 52: 25, 53: 35 };

export type RiichiWaitSample = {
  seat: 0 | 1 | 2 | 3;
  /** 听牌种类数，例如两面为 2。 */
  waitTileTypeCount: number;
  /** 按 0=1m … 33=中 排列的待牌下标。 */
  waitTileIndexes: number[];
  /** 立直瞬间自己视角可见范围之外的待牌张数。 */
  remainingWaitTileCount: number;
  isMultiSide: boolean;
  isGoodShape: boolean;
};

export type RiichiWaitSummary = {
  /** 可还原手牌的立直手数，作为两个比率的分母。 */
  riichiCount: number;
  multiSideCount: number;
  goodShapeCount: number;
  multiSideRate: number | null;
  goodShapeRate: number | null;
};

/** 把牌谱中的牌编码转换为 0…33 下标，无法识别时返回 -1。 */
export function tileIndexFromCode(code: number): number {
  const normalized = RED_FIVE_CODES[code] ?? code;
  const suit = Math.floor(normalized / 10);
  const rank = normalized % 10;
  if (suit >= 1 && suit <= 3 && rank >= 1 && rank <= 9) return (suit - 1) * 9 + rank - 1;
  if (suit === 4 && rank >= 1 && rank <= 7) return 26 + rank;
  return -1;
}

function tileCodesFromString(value: string): number[] {
  const codes: number[] = [];
  for (const match of value.matchAll(/\d{2}/g)) codes.push(Number(match[0]));
  return codes;
}

function countsFromTiles(tiles: number[]): number[] {
  const counts = Array<number>(34).fill(0);
  for (const tile of tiles) {
    const index = tileIndexFromCode(tile);
    if (index >= 0) counts[index] += 1;
  }
  return counts;
}

function canFormMelds(counts: number[], start: number): boolean {
  let index = start;
  while (index < 34 && counts[index] === 0) index += 1;
  if (index >= 34) return true;
  if (counts[index] >= 3) {
    counts[index] -= 3;
    const ok = canFormMelds(counts, index);
    counts[index] += 3;
    if (ok) return true;
  }
  if (index < 27 && index % 9 <= 6 && counts[index + 1] > 0 && counts[index + 2] > 0) {
    counts[index] -= 1;
    counts[index + 1] -= 1;
    counts[index + 2] -= 1;
    const ok = canFormMelds(counts, index);
    counts[index] += 1;
    counts[index + 1] += 1;
    counts[index + 2] += 1;
    if (ok) return true;
  }
  return false;
}

function isSevenPairs(counts: number[]): boolean {
  let pairs = 0;
  for (const count of counts) {
    if (count === 0) continue;
    if (count !== 2) return false;
    pairs += 1;
  }
  return pairs === 7;
}

function isThirteenOrphans(counts: number[]): boolean {
  let kinds = 0;
  let hasPair = false;
  for (const index of TERMINAL_AND_HONOR_INDEXES) {
    if (counts[index] > 0) kinds += 1;
    if (counts[index] >= 2) hasPair = true;
  }
  return kinds === 13 && hasPair;
}

/** 判断 34 种牌的数量表是否构成和牌（含七对子与国士无双）。 */
function isWinningCounts(counts: number[]): boolean {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 14) {
    if (isSevenPairs(counts)) return true;
    if (isThirteenOrphans(counts)) return true;
  }
  for (let index = 0; index < 34; index += 1) {
    if (counts[index] < 2) continue;
    counts[index] -= 2;
    const ok = canFormMelds(counts, 0);
    counts[index] += 2;
    if (ok) return true;
  }
  return false;
}

/** 判断手牌（含鸣牌时为剩余的暗牌）是否已经和了。 */
export function isWinningHand(tiles: number[]): boolean {
  return isWinningCounts(countsFromTiles(tiles));
}

/** 列出能完成这手牌的待牌下标。 */
export function winningTileIndexes(concealedTiles: number[]): number[] {
  const counts = countsFromTiles(concealedTiles);
  const candidates = new Set<number>();
  let allTerminalOrHonor = concealedTiles.length > 0;
  for (let index = 0; index < 34; index += 1) {
    if (counts[index] === 0) continue;
    if (!TERMINAL_AND_HONOR_INDEXES.includes(index)) allTerminalOrHonor = false;
    candidates.add(index);
    if (index >= 27) continue;
    const suitStart = Math.floor(index / 9) * 9;
    for (let offset = -2; offset <= 2; offset += 1) {
      const candidate = index + offset;
      if (candidate >= suitStart && candidate < suitStart + 9) candidates.add(candidate);
    }
  }
  // 国士无双的待牌可能是手里一张都没有的字牌或幺九，需要放开全部幺九字牌。
  if (allTerminalOrHonor) for (const index of TERMINAL_AND_HONOR_INDEXES) candidates.add(index);
  const waits: number[] = [];
  for (const index of [...candidates].sort((left, right) => left - right)) {
    if (counts[index] >= 4) continue;
    counts[index] += 1;
    const winning = isWinningCounts(counts);
    counts[index] -= 1;
    if (winning) waits.push(index);
  }
  return waits;
}

function removeTile(hand: number[], tile: number): boolean {
  const index = hand.lastIndexOf(tile);
  if (index < 0) return false;
  hand.splice(index, 1);
  return true;
}

type RoundArrays = {
  initialHands: unknown[];
  drawSequences: unknown[];
  rivers: unknown[];
};

function readRoundArrays(round: unknown): RoundArrays | null {
  if (!Array.isArray(round) || round.length < 16) return null;
  const initialHands: unknown[] = [];
  const drawSequences: unknown[] = [];
  const rivers: unknown[] = [];
  for (let seat = 0; seat < 4; seat += 1) {
    const initial = round[INITIAL_HAND_OFFSET + seat * ROUND_EVENT_STRIDE];
    const draws = round[DRAW_OFFSET + seat * ROUND_EVENT_STRIDE];
    const river = round[RIVER_OFFSET + seat * ROUND_EVENT_STRIDE];
    if (!Array.isArray(initial) || !Array.isArray(draws) || !Array.isArray(river)) return null;
    initialHands.push(initial);
    drawSequences.push(draws);
    rivers.push(river);
  }
  return { initialHands, drawSequences, rivers };
}

function riichiIndexInRiver(river: unknown[]): number {
  return river.findIndex((entry) => typeof entry === "string" && entry.startsWith("r"));
}

/**
 * 从天凤紧凑牌谱复现立直瞬间的暗牌。
 * 立直前出现过暗杠以外的鸣牌时返回 null，交由调用方按缺失处理。
 */
function reconstructRiichiHand(
  arrays: RoundArrays,
  seat: number,
): { concealed: number[]; meldCount: number; riichiIndex: number } | null {
  const initial = arrays.initialHands[seat] as unknown[];
  const draws = arrays.drawSequences[seat] as unknown[];
  const river = arrays.rivers[seat] as unknown[];
  const riichiIndex = riichiIndexInRiver(river);
  if (riichiIndex < 0) return null;
  const concealed = initial.map((tile) => Number(tile));
  if (concealed.some((tile) => tileIndexFromCode(tile) < 0)) return null;
  let meldCount = 0;
  for (let turn = 0; turn <= riichiIndex; turn += 1) {
    const drawn = draws[turn];
    if (typeof drawn !== "number") return null;
    concealed.push(drawn);
    if (turn === riichiIndex) continue;
    const entry = river[turn];
    if (typeof entry === "number") {
      if (entry === KAN_PLACEHOLDER_CODE) return null;
      const tile = entry === TSUMOGIRI_CODE ? drawn : entry;
      if (!removeTile(concealed, tile)) return null;
      continue;
    }
    if (typeof entry === "string" && entry.startsWith("r")) {
      if (!removeTile(concealed, Number(entry.slice(1)))) return null;
      continue;
    }
    if (typeof entry === "string" && entry.includes("a")) {
      meldCount += 1;
      for (const code of tileCodesFromString(entry)) {
        if (!removeTile(concealed, code)) return null;
      }
      continue;
    }
    return null;
  }
  const riichiEntry = String(river[riichiIndex]);
  const declared = Number(riichiEntry.slice(1));
  const riichiTile = declared === TSUMOGIRI_CODE ? draws[riichiIndex] : declared;
  if (typeof riichiTile !== "number" || !removeTile(concealed, riichiTile)) return null;
  if (concealed.length !== 13 - 3 * meldCount) return null;
  return { concealed, meldCount, riichiIndex };
}

function actsBeforeSeat(dealer: number, seat: number, other: number): boolean {
  return (other - dealer + 4) % 4 < (seat - dealer + 4) % 4;
}

/**
 * 统计立直瞬间自己视角的可见张数：自己手牌、已打出的牌、已鸣出的副露与已翻开的宝牌指示牌。
 * 返回可见张数数组与立直前已翻开的宝牌指示牌张数。
 */
function visibleTileCounts(
  round: unknown[],
  arrays: RoundArrays,
  seat: number,
  concealed: number[],
  riichiIndex: number,
): number[] {
  const counts = countsFromTiles(concealed);
  const dealer = Array.isArray(round[0]) && Number.isFinite(Number((round[0] as unknown[])[0]))
    ? Number((round[0] as unknown[])[0]) % 4
    : 0;
  let kansBeforeRiichi = 0;
  for (let other = 0; other < 4; other += 1) {
    const river = arrays.rivers[other] as unknown[];
    const draws = arrays.drawSequences[other] as unknown[];
    const limit = other === seat
      ? riichiIndex
      : Math.min(riichiIndex - 1 + (actsBeforeSeat(dealer, seat, other) ? 1 : 0), river.length - 1);
    for (let turn = 0; turn <= limit; turn += 1) {
      const entry = river[turn];
      if (typeof entry === "number") {
        if (entry === KAN_PLACEHOLDER_CODE) continue;
        const tile = entry === TSUMOGIRI_CODE ? draws[turn] : entry;
        if (typeof tile === "number") counts[tileIndexFromCode(tile)] += 1;
        continue;
      }
      if (typeof entry !== "string") continue;
      if (entry.startsWith("r")) {
        counts[tileIndexFromCode(Number(entry.slice(1)))] += 1;
        continue;
      }
      const codes = tileCodesFromString(entry);
      if (entry.includes("a")) {
        kansBeforeRiichi += 1;
        for (const code of codes) counts[tileIndexFromCode(code)] += 1;
        continue;
      }
      if (entry.includes("k")) {
        // 加杠：前三个牌早已随碰鸣出，此处只补记新翻开的第四张。
        counts[tileIndexFromCode(codes[codes.length - 1])] += 1;
        kansBeforeRiichi += 1;
      }
    }
    for (let turn = 0; turn <= limit; turn += 1) {
      const drawn = draws[turn];
      if (typeof drawn !== "string") continue;
      const codes = tileCodesFromString(drawn);
      if (drawn.includes("m")) kansBeforeRiichi += 1;
      for (const code of codes) counts[tileIndexFromCode(code)] += 1;
    }
  }
  const indicators = Array.isArray(round[2]) ? (round[2] as unknown[]) : [];
  for (const indicator of indicators.slice(0, 1 + kansBeforeRiichi)) {
    const index = tileIndexFromCode(Number(indicator));
    if (index >= 0) counts[index] += 1;
  }
  return counts;
}

/** 逐小局提取所有可还原的立直牌形样本。 */
export function riichiWaitSamples(rounds: unknown[][]): RiichiWaitSample[] {
  const samples: RiichiWaitSample[] = [];
  for (const round of rounds) {
    const arrays = readRoundArrays(round);
    if (!arrays) continue;
    for (let seat = 0; seat < 4; seat += 1) {
      const reconstruction = reconstructRiichiHand(arrays, seat);
      if (!reconstruction) continue;
      const waits = winningTileIndexes(reconstruction.concealed);
      if (!waits.length) continue;
      const visible = visibleTileCounts(round, arrays, seat, reconstruction.concealed, reconstruction.riichiIndex);
      const remainingWaitTileCount = waits.reduce((sum, index) => sum + Math.max(0, 4 - visible[index]), 0);
      samples.push({
        seat: seat as 0 | 1 | 2 | 3,
        waitTileTypeCount: waits.length,
        waitTileIndexes: waits,
        remainingWaitTileCount,
        isMultiSide: waits.length >= RIICHI_MULTI_SIDE_MIN_TILE_TYPES,
        isGoodShape: remainingWaitTileCount >= RIICHI_GOOD_SHAPE_MIN_REMAINING_TILES,
      });
    }
  }
  return samples;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** 汇总两个立直牌形指标；没有可还原的立直时返回 null 比率。 */
export function summarizeRiichiWaitSamples(samples: RiichiWaitSample[]): RiichiWaitSummary {
  const multiSideCount = samples.filter((sample) => sample.isMultiSide).length;
  const goodShapeCount = samples.filter((sample) => sample.isGoodShape).length;
  return {
    riichiCount: samples.length,
    multiSideCount,
    goodShapeCount,
    multiSideRate: rate(multiSideCount, samples.length),
    goodShapeRate: rate(goodShapeCount, samples.length),
  };
}
