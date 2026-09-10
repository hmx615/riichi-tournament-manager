export const tutorialReviewers = [
  { id: "hmx", username: "hmx", displayName: "何明轩", aliases: ["hmx", "何明轩", "何 明轩"] },
  { id: "phq", username: "phq", displayName: "彭虹清", aliases: ["phq", "彭虹清", "彭 虹清"] },
  { id: "ezy", username: "ezy", displayName: "鄂子懿", aliases: ["ezy", "鄂子懿", "鄂 子懿"] },
  { id: "wdj", username: "wdj", displayName: "吴东杰", aliases: ["wdj", "吴东杰", "吴 东杰"] },
] as const;

export type TutorialReviewerId = (typeof tutorialReviewers)[number]["id"];
export type TutorialCaseStatus =
  | "pending_initial"
  | "pending_secondary"
  | "final"
  | "rejected_initial"
  | "rejected_secondary";
export type TutorialReviewAction =
  | "initial_pass"
  | "initial_reject"
  | "secondary_pass"
  | "secondary_reject"
  | "return_initial"
  | "restore_initial"
  | "restore_secondary"
  | "return_secondary";

export type TutorialReviewEvent = {
  id: string;
  reviewerId: TutorialReviewerId;
  reviewerName: string;
  action: TutorialReviewAction;
  fromStatus: TutorialCaseStatus;
  toStatus: TutorialCaseStatus;
  note: string;
  createdAt: string;
};

export type TutorialCaseState = {
  id: string;
  status: TutorialCaseStatus;
  version: number;
  note: string;
  updatedAt: string | null;
  history: TutorialReviewEvent[];
};

export type TutorialCandidate = {
  id: string;
  matchNumber: number;
  roundIndex: number;
  roundLabel: string;
  eventIndex: number;
  seatCode: "E" | "S" | "W" | "N";
  seatWind: string;
  turnNumber: number;
  playerName: string;
  participant: string;
  shantenTransition: "2-1" | "1-1";
  preDrawUkeire: number;
  bestUkeire: number;
  ukeireImprovement: number;
  hand: string[];
  drawnTile: string;
  actualDiscard: string;
  actualRelation: string;
  modelChoices: Array<{
    model: string;
    discard: string;
    probability: number;
    effectiveTileCount: number;
    effectiveTileTypes: number;
    recommendations?: Array<{
      discard: string;
      probability: number;
      effectiveTileCount: number;
      effectiveTileTypes: number;
    }>;
  }>;
  tags: string[];
  lessonScore: number;
  efficientDiscardCount: number;
  ukeireSpread: number;
  doraMarkers: string[];
  actorSeat: number;
  nagaReportId: string;
  tenhouLogId: string;
  board: {
    scores: number[];
    dealerSeat: number;
    roundWind: string;
    kyoku: number;
    honba: number;
    kyotaku: number;
    riichiSeats: boolean[];
    leftTileCount: number;
    playerNames: string[];
    rivers: Array<Array<{ tile: string; called: boolean; riichi: boolean; tsumogiri: boolean }>>;
    concealedTileCounts: number[];
    melds: Array<Array<{
      type: "chi" | "pon" | "daiminkan" | "ankan" | "kakan";
      tiles: string[];
      calledIndex: number | null;
      addedTile: string | null;
    }>>;
  };
};

export const initialTutorialCaseState = (id: string): TutorialCaseState => ({
  id,
  status: "pending_initial",
  version: 0,
  note: "",
  updatedAt: null,
  history: [],
});

export function tutorialReviewerById(id: string) {
  return tutorialReviewers.find((reviewer) => reviewer.id === id) ?? null;
}

export function tutorialReviewerByLogin(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll(" ", "");
  return tutorialReviewers.find((reviewer) => reviewer.aliases.some(
    (alias) => alias.toLowerCase().replaceAll(" ", "") === normalized,
  )) ?? null;
}

const transitions: Record<TutorialReviewAction, { from: TutorialCaseStatus; to: TutorialCaseStatus }> = {
  initial_pass: { from: "pending_initial", to: "pending_secondary" },
  initial_reject: { from: "pending_initial", to: "rejected_initial" },
  secondary_pass: { from: "pending_secondary", to: "final" },
  secondary_reject: { from: "pending_secondary", to: "rejected_secondary" },
  return_initial: { from: "pending_secondary", to: "pending_initial" },
  restore_initial: { from: "rejected_initial", to: "pending_initial" },
  restore_secondary: { from: "rejected_secondary", to: "pending_secondary" },
  return_secondary: { from: "final", to: "pending_secondary" },
};

export function transitionTutorialCase(
  current: TutorialCaseState,
  action: TutorialReviewAction,
  reviewerId: TutorialReviewerId,
  note: string,
  createdAt = new Date().toISOString(),
): TutorialCaseState {
  const transition = transitions[action];
  if (current.status !== transition.from) throw new Error("牌例状态已变化，请刷新后重试");
  const reviewer = tutorialReviewerById(reviewerId);
  if (!reviewer) throw new Error("筛选账号无效");
  if (action === "secondary_pass" || action === "secondary_reject") {
    const initialReviewer = [...current.history].reverse().find((event) => event.action === "initial_pass")?.reviewerId;
    if (!initialReviewer) throw new Error("找不到该牌例的初筛通过记录");
    if (initialReviewer === reviewerId) throw new Error("复筛必须由另一位管理员完成");
  }
  const normalizedNote = note.trim().slice(0, 500);
  return {
    ...current,
    status: transition.to,
    note: normalizedNote,
    updatedAt: createdAt,
    history: [...current.history, {
      id: crypto.randomUUID(),
      reviewerId,
      reviewerName: reviewer.displayName,
      action,
      fromStatus: current.status,
      toStatus: transition.to,
      note: normalizedNote,
      createdAt,
    }],
  };
}

export function initialPassReviewerId(state: TutorialCaseState) {
  return [...state.history].reverse().find((event) => event.action === "initial_pass")?.reviewerId ?? null;
}
