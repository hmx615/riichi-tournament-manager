import type { EstimatedRank } from "./estimated-rank";

export type MatchLevel = "top" | "phoenix" | "tokujou" | "horse";

export type MatchLevelAssessment = {
  level: MatchLevel;
  averageRank: number;
};

export function assessMatchLevel(ranks: Array<EstimatedRank | null>): MatchLevelAssessment | null {
  if (ranks.length !== 4 || ranks.some((rank) => rank == null)) return null;
  const values = ranks.map((rank) => rank === "10+" ? 10 : rank as number);
  const averageRank = values.reduce((sum, rank) => sum + rank, 0) / values.length;
  const level = averageRank >= 8.5 ? "top" : averageRank >= 7 ? "phoenix" : averageRank >= 4 ? "tokujou" : "horse";
  return { level, averageRank };
}
