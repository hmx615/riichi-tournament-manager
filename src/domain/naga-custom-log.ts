export type NormalizedNagaCustomLog = {
  ref: string;
  name: string[];
  sc: number[];
  log: unknown[][];
};

type CustomHaihuReport = {
  custom_haihu?: unknown;
  player_info?: {
    name?: unknown;
    umaoka?: unknown;
  };
};

function parseHands(value: unknown): unknown[][] {
  if (!Array.isArray(value) || !value.length || !value.every((item) => typeof item === "string")) {
    throw new Error("NAGA 自定义牌谱缺少小局数据");
  }
  const hands = value.flatMap((item) => {
    try {
      const parsed = JSON.parse(item as string) as unknown;
      if (!Array.isArray(parsed)) throw new Error();
      return parsed;
    } catch {
      throw new Error("NAGA 自定义牌谱的小局格式无效");
    }
  });
  if (!hands.length || !hands.every((hand) => Array.isArray(hand) && hand.length >= 17)) {
    throw new Error("NAGA 自定义牌谱的小局格式无效");
  }
  return hands as unknown[][];
}

function finalRawPoints(lastHand: unknown[]) {
  const initial = lastHand[1];
  if (!Array.isArray(initial) || initial.length !== 4 || !initial.every((point) => Number.isFinite(Number(point)))) {
    throw new Error("NAGA 自定义牌谱缺少终局点数");
  }
  const points = initial.map(Number);
  let riichiDeclarations = 0;

  // Tenhou /6 results award riichi sticks but do not include the declaration's
  // 1,000-point payment in the result delta.
  for (let seat = 0; seat < 4; seat += 1) {
    const discards = lastHand[6 + seat * 3];
    if (Array.isArray(discards) && discards.some((tile) => typeof tile === "string" && tile.startsWith("r"))) {
      points[seat] -= 1000;
      riichiDeclarations += 1;
    }
  }
  const results = lastHand.slice(16);
  for (const result of results) {
    if (!Array.isArray(result) || !Array.isArray(result[1])) continue;
    for (let seat = 0; seat < 4; seat += 1) points[seat] += Number(result[1][seat] || 0);
  }
  if (!results.some((result) => Array.isArray(result) && result[0] === "和了")) {
    const round = lastHand[0];
    const carriedRiichiSticks = Array.isArray(round) && Number.isFinite(Number(round[2])) ? Number(round[2]) : 0;
    const unclaimedRiichiPoints = (carriedRiichiSticks + riichiDeclarations) * 1000;
    if (unclaimedRiichiPoints > 0) {
      const leader = [0, 1, 2, 3].sort((left, right) => points[right] - points[left] || left - right)[0];
      points[leader] += unclaimedRiichiPoints;
    }
  }
  if (!points.every(Number.isFinite)) throw new Error("NAGA 自定义牌谱的终局点数无效");
  return points;
}

function resultScores(value: unknown, rawPoints: number[]) {
  if (Array.isArray(value) && value.length === 4 && value.every((point) => Number.isFinite(Number(point)))) {
    return value.map(Number);
  }
  const order = [0, 1, 2, 3].sort((left, right) => rawPoints[right] - rawPoints[left] || left - right);
  const scores = Array(4).fill(0);
  order.forEach((seat, index) => { scores[seat] = 4 - index; });
  return scores;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function normalizeNagaCustomLog(report: unknown): Promise<NormalizedNagaCustomLog> {
  if (!report || typeof report !== "object") throw new Error("NAGA 报告格式无效");
  const value = report as CustomHaihuReport;
  const names = value.player_info?.name;
  if (!Array.isArray(names) || names.length !== 4 || !names.every((name) => typeof name === "string" && name.length > 0)) {
    throw new Error("NAGA 自定义牌谱缺少四家昵称");
  }
  const hands = parseHands(value.custom_haihu);
  const rawPoints = finalRawPoints(hands[hands.length - 1]);
  const outcomes = resultScores(value.player_info?.umaoka, rawPoints);
  const canonical = JSON.stringify({ name: names, log: hands });
  const ref = `naga-custom-${(await sha256(canonical)).slice(0, 32)}`;
  return {
    ref,
    name: [...names],
    sc: rawPoints.flatMap((point, seat) => [point, outcomes[seat]]),
    log: hands,
  };
}
