import "server-only";

import type { Competition } from "@/domain/types";
import { readCachedLogs, type TenhouLog } from "@/server/tenhou";
import { cachedSnapshot } from "@/server/stats-snapshot";
import { riichiWaitSamples, summarizeRiichiWaitSamples, type RiichiWaitSample } from "../domain/riichi-wait";
// @ts-expect-error The fixed legacy calculator is CommonJS and has no type declarations.
import legacyStatsModule from "../../reference/1st-xrc-29/mrc_stats.js";

export type PlayerSummary = Record<string, number | null>;
export type CompetitionSummary = Record<string, PlayerSummary>;

type LegacyStatsModule = {
  createStats(): Record<string, number | number[]>;
  addGameStats(stats: Record<string, number | number[]>, log: TenhouLog, seat: number): void;
  addHandStats(allStats: Record<string, Record<string, number | number[]>>, hand: unknown[], seatIdentities: string[]): void;
  finalize(stats: Record<string, number | number[]>): PlayerSummary;
};

function legacyStats(): LegacyStatsModule {
  return legacyStatsModule as LegacyStatsModule;
}

async function computeCompetitionSummaryUncached(competition: Competition): Promise<CompetitionSummary> {
  const calculator = legacyStats();
  const allStats = Object.fromEntries(competition.participants.map((participant) => [participant.id, calculator.createStats()]));
  const waitSamples = new Map<string, RiichiWaitSample[]>(competition.participants.map((participant) => [participant.id, []]));
  const matches = competition.matches.filter((item) => item.status === "completed");
  const logs = await readCachedLogs(matches.map((match) => match.tenhouLogId));
  for (const match of matches) {
    const log = logs.get(match.tenhouLogId);
    if (!log) throw new Error(`缺少牌谱缓存：${match.tenhouLogId}`);
    const seats = [...match.seats].sort((a, b) => a.seat - b.seat);
    const identities = seats.map((seat) => seat.participantId);
    seats.forEach((seat) => calculator.addGameStats(allStats[seat.participantId], log, seat.seat));
    for (const hand of log.log) calculator.addHandStats(allStats, hand, identities);
    for (const sample of riichiWaitSamples(log.log)) {
      waitSamples.get(seats[sample.seat]?.participantId)?.push(sample);
    }
  }
  return Object.fromEntries(competition.participants.map((participant) => {
    const wait = summarizeRiichiWaitSamples(waitSamples.get(participant.id) || []);
    return [participant.id, {
      ...calculator.finalize(allStats[participant.id]),
      立直多面率: wait.multiSideRate,
      立直好型率: wait.goodShapeRate,
    }];
  }));
}

// 一次全量统计要解析该比赛全部牌谱（几十毫秒起步），免费版 Worker 会被 CPU 上限掐断，
// 因此结果按"数据版本"缓存到 D1，命中时只读一行小 JSON。
export async function computeCompetitionSummary(competition: Competition): Promise<CompetitionSummary> {
  return cachedSnapshot(`competition-summary-v1:${competition.id}`, () => computeCompetitionSummaryUncached(competition));
}
