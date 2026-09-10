import { notFound, redirect } from "next/navigation";
import { TutorialCaseDetail } from "@/components/tutorial-case-detail";
import candidatesDocument from "@/data/tutorial/one-shanten-candidates.json";
import { initialTutorialCaseState, type TutorialCandidate } from "@/domain/tutorial-review";
import { requireTutorialReviewerPage } from "@/server/tutorial-auth";
import { listTutorialCaseStates } from "@/server/tutorial-review-repository";

const candidates = candidatesDocument as TutorialCandidate[];

function stageForStatus(status: string) {
  if (status.startsWith("rejected")) return "rejected" as const;
  if (status === "pending_initial") return "initial" as const;
  if (status === "pending_secondary") return "secondary" as const;
  return "final" as const;
}

function withRiichiTest(candidate: TutorialCandidate) {
  const declarationPositions = [1, 6, 7, 18];
  const tileSequence = [
    "1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z",
    "5z", "6z", "7z", "2m", "8m", "2p", "8p", "2s", "8s", "3m",
    "7m", "3p", "7p", "3s", "7s", "4m", "6m", "4p", "6p", "4s",
  ];
  const rivers = candidate.board.rivers.map((_river, seat) => {
    const relativeSeat = (seat - candidate.actorSeat + 4) % 4;
    const declarationPosition = declarationPositions[relativeSeat];
    return Array.from({ length: declarationPosition + 2 }, (_, index) => ({
      tile: tileSequence[(index + relativeSeat * 5) % tileSequence.length],
      called: false,
      riichi: index === declarationPosition - 1,
      tsumogiri: index >= declarationPosition,
    }));
  });
  return {
    ...candidate,
    board: {
      ...candidate.board,
      scores: candidate.board.scores.map((score) => score - 1000),
      kyotaku: candidate.board.kyotaku + 4,
      riichiSeats: [true, true, true, true],
      rivers,
    },
  };
}

function withKanTest(candidate: TutorialCandidate, kanCount: 2 | 4 = 2) {
  const bottomSeat = candidate.actorSeat;
  const topSeat = (candidate.actorSeat + 2) % 4;
  const rightSeat = (candidate.actorSeat + 1) % 4;
  const leftSeat = (candidate.actorSeat + 3) % 4;
  const melds = candidate.board.melds.map((seatMelds, seat) => {
    if (seat === topSeat) return [{ type: "ankan" as const, tiles: ["5m", "5m", "5m", "5m"], calledIndex: null, addedTile: null }];
    if (seat === rightSeat) return [{ type: "daiminkan" as const, tiles: ["7p", "7p", "7p", "7p"], calledIndex: 1, addedTile: null }];
    if (kanCount === 4 && seat === leftSeat) return [{ type: "ankan" as const, tiles: ["2s", "2s", "2s", "2s"], calledIndex: null, addedTile: null }];
    if (kanCount === 4 && seat === bottomSeat) return [{ type: "daiminkan" as const, tiles: ["3p", "3p", "3p", "3p"], calledIndex: 1, addedTile: null }];
    return seatMelds;
  });
  const concealedTileCounts = candidate.board.concealedTileCounts.map((count, seat) => (
    seat === topSeat || seat === rightSeat || kanCount === 4 && (seat === leftSeat || seat === bottomSeat) ? 10 : count
  ));
  const rivers = candidate.board.rivers.map((river, seat) => river.map((entry, index) => ({
    ...entry,
    called: seat === candidate.actorSeat && index === river.length - 1 ? true : entry.called,
  })));
  return {
    ...candidate,
    doraMarkers: [...candidate.doraMarkers, ...["3s", "6z", "9m", "1p"].slice(0, kanCount)],
    board: { ...candidate.board, concealedTileCounts, melds, rivers },
  };
}

export default async function TutorialCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { caseId } = await params;
  const candidate = candidates.find((item) => item.id === caseId);
  if (!candidate) notFound();
  const reviewer = await requireTutorialReviewerPage(`/tutorials/one-shanten/cases/${caseId}`);
  const storedStates = await listTutorialCaseStates();
  const stateById = new Map(storedStates.map((state) => [state.id, state]));
  const state = stateById.get(caseId) ?? initialTutorialCaseState(caseId);
  const inferredStage = stageForStatus(state.status);
  const query = await searchParams;
  const requestedStage = query.stage;
  const visualTestMode = query.test === "riichi" || query.test === "kan" || query.test === "kan4" ? query.test : null;
  const reviewStage = requestedStage === "initial" || requestedStage === "secondary" || requestedStage === "final" || requestedStage === "rejected"
    ? requestedStage
    : inferredStage;
  if (reviewStage !== inferredStage) redirect(`/tutorials/one-shanten/${reviewStage}`);
  const counts = {
    initial: candidates.filter((item) => (stateById.get(item.id) ?? initialTutorialCaseState(item.id)).status === "pending_initial").length,
    secondary: candidates.filter((item) => stateById.get(item.id)?.status === "pending_secondary").length,
    final: candidates.filter((item) => stateById.get(item.id)?.status === "final").length,
    rejected: candidates.filter((item) => stateById.get(item.id)?.status.startsWith("rejected")).length,
  };
  const queue = candidates.filter((item) => {
    const itemStatus = (stateById.get(item.id) ?? initialTutorialCaseState(item.id)).status;
    return reviewStage === "rejected" ? itemStatus.startsWith("rejected") : itemStatus === state.status;
  });
  const index = queue.findIndex((item) => item.id === caseId);
  return (
    <TutorialCaseDetail
      candidate={visualTestMode === "riichi" ? withRiichiTest(candidate) : visualTestMode === "kan" ? withKanTest(candidate) : visualTestMode === "kan4" ? withKanTest(candidate, 4) : candidate}
      initialState={state}
      reviewerId={reviewer.id}
      reviewerName={reviewer.displayName}
      reviewStage={reviewStage}
      counts={counts}
      previousCaseId={index > 0 ? queue[index - 1].id : null}
      nextCaseId={index >= 0 && index < queue.length - 1 ? queue[index + 1].id : null}
      visualTestMode={visualTestMode ?? undefined}
    />
  );
}
