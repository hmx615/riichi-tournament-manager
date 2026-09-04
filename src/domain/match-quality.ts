import type { MatchRecord } from "./types";

export type MatchQuality = "gold" | "diamond";

const qualityModels = ["ニシキ", "カガシ"] as const;

export function matchQuality(match: MatchRecord): MatchQuality | null {
  const participantIds = [...new Set(match.seats.map((seat) => seat.participantId))];
  if (participantIds.length !== 4) return null;

  const ratings = new Map(
    (match.nagaRatings || []).map((rating) => [`${rating.participantId}\u0000${rating.model}`, rating.rating]),
  );
  const playerRatings = participantIds.map((participantId) => (
    qualityModels.map((model) => ratings.get(`${participantId}\u0000${model}`))
  ));
  if (playerRatings.some((values) => values.some((value) => value == null || !Number.isFinite(value)))) return null;
  if (playerRatings.every((values) => values.every((value) => value! > 90))) return "diamond";
  if (playerRatings.every((values) => Math.max(...values as number[]) > 90)) return "gold";
  return null;
}
