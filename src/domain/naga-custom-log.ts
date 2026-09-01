import { finalRawPointsFromHands, resultScoresFromRawPoints, sha256Hex } from "./tenhou-log-normalizer";

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

export async function normalizeNagaCustomLog(report: unknown): Promise<NormalizedNagaCustomLog> {
  if (!report || typeof report !== "object") throw new Error("NAGA 报告格式无效");
  const value = report as CustomHaihuReport;
  const names = value.player_info?.name;
  if (!Array.isArray(names) || names.length !== 4 || !names.every((name) => typeof name === "string" && name.length > 0)) {
    throw new Error("NAGA 自定义牌谱缺少四家昵称");
  }
  const hands = parseHands(value.custom_haihu);
  const rawPoints = finalRawPointsFromHands(hands, "NAGA 自定义牌谱");
  const outcomes = resultScoresFromRawPoints(value.player_info?.umaoka, rawPoints);
  const canonical = JSON.stringify({ name: names, log: hands });
  const ref = `naga-custom-${(await sha256Hex(canonical)).slice(0, 32)}`;
  return {
    ref,
    name: [...names],
    sc: rawPoints.flatMap((point, seat) => [point, outcomes[seat]]),
    log: hands,
  };
}
