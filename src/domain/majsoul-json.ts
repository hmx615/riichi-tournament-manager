import { finalRawPointsFromHands, resultScoresFromRawPoints, sha256Hex } from "./tenhou-log-normalizer";

export type NormalizedMajsoulLog = {
  ref: string;
  name: string[];
  sc: number[];
  log: unknown[][];
  sourcePlatform: "majsoul";
  playedAt?: string;
  title?: unknown[];
  rule?: Record<string, unknown>;
};

type MajsoulJson = {
  title?: unknown;
  name?: unknown;
  rule?: unknown;
  sc?: unknown;
  log?: unknown;
};

function parsePlayedAt(title: unknown) {
  if (!Array.isArray(title) || typeof title[1] !== "string") return undefined;
  const timestamp = Date.parse(title[1]);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

export async function normalizeMajsoulJson(jsonText: string): Promise<NormalizedMajsoulLog> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("雀魂 JSON 文件内容不是有效的 JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("雀魂 JSON 顶层格式无效");
  const value = parsed as MajsoulJson;
  if (!Array.isArray(value.name) || value.name.length !== 4 || !value.name.every((name) => typeof name === "string" && name.length > 0)) {
    throw new Error("雀魂 JSON 缺少四家昵称");
  }
  if (!Array.isArray(value.log) || !value.log.length || !value.log.every((hand) => Array.isArray(hand) && hand.length >= 17)) {
    throw new Error("雀魂 JSON 缺少有效的小局数据");
  }
  const hands = value.log as unknown[][];
  const suppliedScores = value.sc;
  const rawPoints = Array.isArray(suppliedScores) && suppliedScores.length >= 8 && suppliedScores.every((score) => Number.isFinite(Number(score)))
    ? [suppliedScores[0], suppliedScores[2], suppliedScores[4], suppliedScores[6]].map(Number)
    : finalRawPointsFromHands(hands, "雀魂 JSON");
  const outcomes = Array.isArray(suppliedScores) && suppliedScores.length >= 8 && suppliedScores.every((score) => Number.isFinite(Number(score)))
    ? [suppliedScores[1], suppliedScores[3], suppliedScores[5], suppliedScores[7]].map(Number)
    : resultScoresFromRawPoints(undefined, rawPoints);
  const canonical = JSON.stringify({ name: value.name, log: hands });
  const ref = `majsoul-${(await sha256Hex(canonical)).slice(0, 32)}`;
  const title = Array.isArray(value.title) ? value.title : undefined;
  const rule = value.rule && typeof value.rule === "object" && !Array.isArray(value.rule)
    ? value.rule as Record<string, unknown>
    : undefined;
  return {
    ref,
    name: [...value.name] as string[],
    sc: rawPoints.flatMap((point, seat) => [point, outcomes[seat]]),
    log: hands,
    sourcePlatform: "majsoul",
    playedAt: parsePlayedAt(title),
    ...(title ? { title } : {}),
    ...(rule ? { rule } : {}),
  };
}
