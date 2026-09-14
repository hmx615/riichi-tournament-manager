import type { Competition, IndividualStage, Participant } from "./types";

export type IndividualStanding = {
  participant: Participant;
  points: number;
  games: number;
  averageRank: number | null;
  rank: number;
  advancing: boolean;
};

export function individualStageStandings(competition: Competition, stage: IndividualStage): IndividualStanding[] {
  const settings = competition.individualSettings;
  const matches = competition.matches.filter((match) => match.status === "completed" && match.stage === stage);
  const rows = competition.participants.map((participant) => {
    const seats = matches.flatMap((match) => match.seats.filter((seat) => seat.participantId === participant.id));
    const points = seats.reduce((sum, seat) => sum + seat.competitionPoints, 0);
    const rankTotal = seats.reduce((sum, seat) => sum + seat.rank, 0);
    return { participant, points, games: seats.length, averageRank: seats.length ? rankTotal / seats.length : null };
  }).sort((a, b) => b.points - a.points || (a.averageRank ?? Infinity) - (b.averageRank ?? Infinity) || a.participant.displayName.localeCompare(b.participant.displayName, "zh-CN"));
  const advancingCount = stage === "preliminary" ? settings?.stages.preliminary.advancingPlayerCount ?? 0 : stage === "semifinal" ? settings?.semifinalAdvancingPlayerCount ?? settings?.stages.semifinal.advancingPlayerCount ?? 0 : 0;
  return rows.map((row, index) => ({ ...row, rank: index + 1, advancing: advancingCount > 0 && index < advancingCount }));
}
