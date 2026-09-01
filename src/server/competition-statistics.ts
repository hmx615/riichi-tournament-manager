import "server-only";

import type { Competition } from "@/domain/types";
import { readCachedLogs, type TenhouLog } from "@/server/tenhou";
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

export async function computeCompetitionSummary(competition: Competition): Promise<CompetitionSummary> {
  const calculator = legacyStats();
  const allStats = Object.fromEntries(competition.participants.map((participant) => [participant.id, calculator.createStats()]));
  const matches = competition.matches.filter((item) => item.status === "completed");
  const logs = await readCachedLogs(matches.map((match) => match.tenhouLogId));
  for (const match of matches) {
    const log = logs.get(match.tenhouLogId);
    if (!log) throw new Error(`缺少牌谱缓存：${match.tenhouLogId}`);
    const seats = [...match.seats].sort((a, b) => a.seat - b.seat);
    const identities = seats.map((seat) => seat.participantId);
    seats.forEach((seat) => calculator.addGameStats(allStats[seat.participantId], log, seat.seat));
    for (const hand of log.log) calculator.addHandStats(allStats, hand, identities);
  }
  return Object.fromEntries(competition.participants.map((participant) => [participant.id, calculator.finalize(allStats[participant.id])]));
}
