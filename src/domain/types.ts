export type ParticipantKind = "human" | "ai";
export type CompetitionStatus = "draft" | "active" | "completed" | "archived";
export type MatchStatus = "scheduled" | "processing" | "completed" | "needs_review" | "invalid";

export type Participant = {
  id: string;
  displayName: string;
  kind: ParticipantKind;
  color: string;
  usernames: string[];
};

export type SeatAssignment = {
  seat: 0 | 1 | 2 | 3;
  participantId: string;
  sourceUsername: string;
  rawPoints: number;
  rank: 1 | 2 | 3 | 4;
  competitionPoints: number;
  assignmentSource: "alias" | "manual" | "legacy_import";
};

export type NagaRating = {
  participantId: string;
  model: string;
  rating: number;
  agreementRate: number;
  badMoveRate: number;
  decisionCount: number;
};

export type MatchRecord = {
  id: string;
  matchNumber: number;
  status: MatchStatus;
  playedAt: string;
  tenhouLogId: string;
  tenhouUrl: string;
  nagaUrl: string | null;
  nagaReportId?: string | null;
  nagaRatings?: NagaRating[];
  seats: SeatAssignment[];
  reviewNote: string | null;
};

export type Competition = {
  id: string;
  name: string;
  code: string;
  status: CompetitionStatus;
  plannedMatchCount: number;
  initialPoints: number;
  rankPoints: [number, number, number, number];
  participants: Participant[];
  matches: MatchRecord[];
};

export type LegacySummary = {
  scoreGameCount: number;
  dataGameCount: number;
  handCount: number;
  colors: Record<string, string>;
  players: Record<string, {
    summary: Record<string, number | null>;
    rankCounts: number[];
    competitionPoints: number;
  }>;
  ratings: Record<string, Record<string, { average: number | null; count: number }>>;
};

export type CompetitionSeed = {
  schemaVersion: 1;
  importedAt: string;
  competition: Competition;
  legacySummary: LegacySummary;
};
