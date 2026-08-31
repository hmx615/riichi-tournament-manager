import seedJson from "./1st-xrc.seed.json";
import type { CompetitionSeed, Participant } from "@/domain/types";

export const seed = seedJson as unknown as CompetitionSeed;
export const competition = seed.competition;

export const participantById = Object.fromEntries(
  competition.participants.map((participant) => [participant.id, participant]),
) as Record<string, Participant>;

export function competitionTotals() {
  return totalsForCompetition(competition);
}

export function totalsForCompetition(value: CompetitionSeed["competition"]) {
  const totals = Object.fromEntries(value.participants.map((participant) => [participant.id, 0]));
  for (const match of value.matches) {
    for (const seat of match.seats) totals[seat.participantId] += seat.competitionPoints;
  }
  return Object.fromEntries(Object.entries(totals).map(([id, total]) => [id, Number(total.toFixed(1))]));
}

export function ambiguousUsernames() {
  return ambiguousUsernamesForCompetition(competition);
}

export function ambiguousUsernamesForCompetition(value: CompetitionSeed["competition"]) {
  const owners = new Map<string, string[]>();
  for (const participant of value.participants) {
    for (const username of participant.usernames) {
      owners.set(username, [...(owners.get(username) ?? []), participant.id]);
    }
  }
  return [...owners.entries()]
    .filter(([, participantIds]) => participantIds.length > 1)
    .map(([username, participantIds]) => ({ username, participantIds }));
}
