import type { MatchRecord } from "./types";

export type MatchQuality = "gold" | "diamond";
export type PlayerQuality = "gold" | "diamond" | "horse";

export type MatchQualityAssessment = {
  matchQuality: MatchQuality | null;
  fourHorses: boolean;
  eligiblePlayers: string[];
  players: Record<string, PlayerQuality | null>;
};

const qualityModels = ["ニシキ", "カガシ"] as const;

export function assessMatchQuality(match: MatchRecord): MatchQualityAssessment {
  const participantIds = [...new Set(match.seats.map((seat) => seat.participantId))];
  const ratings = new Map(
    (match.nagaRatings || []).map((rating) => [`${rating.participantId}\u0000${rating.model}`, rating.rating]),
  );
  const eligiblePlayers: string[] = [];
  const players = Object.fromEntries(participantIds.map((participantId) => {
    const values = qualityModels.map((model) => ratings.get(`${participantId}\u0000${model}`));
    if (values.some((value) => value == null || !Number.isFinite(value))) return [participantId, null];
    eligiblePlayers.push(participantId);
    const complete = values as number[];
    if (complete.every((value) => value > 90)) return [participantId, "diamond"];
    if (Math.max(...complete) > 90) return [participantId, "gold"];
    if (Math.max(...complete) < 86) return [participantId, "horse"];
    return [participantId, null];
  })) as Record<string, PlayerQuality | null>;

  if (participantIds.length !== 4) return { matchQuality: null, fourHorses: false, eligiblePlayers, players };
  const playerValues = participantIds.map((participantId) => players[participantId]);
  const matchQuality = playerValues.every((quality) => quality === "diamond")
    ? "diamond"
    : playerValues.every((quality) => quality === "diamond" || quality === "gold") ? "gold" : null;
  return {
    matchQuality,
    fourHorses: playerValues.every((quality) => quality === "horse"),
    eligiblePlayers,
    players,
  };
}

export function matchQuality(match: MatchRecord): MatchQuality | null {
  return assessMatchQuality(match).matchQuality;
}
