import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Competition } from "@/domain/types";
import type { MatchPreview } from "@/server/tenhou";

const mocks = vi.hoisted(() => ({
  appendMatch: vi.fn(),
  getCompetition: vi.fn(),
  listCompetitions: vi.fn(),
  supplementMatchNagaAnalysis: vi.fn(),
  parseMatchSource: vi.fn(),
  isAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/competition-repository", () => ({
  appendMatch: mocks.appendMatch,
  getCompetition: mocks.getCompetition,
  listCompetitions: mocks.listCompetitions,
  supplementMatchNagaAnalysis: mocks.supplementMatchNagaAnalysis,
}));
vi.mock("@/server/tenhou", () => ({ parseMatchSource: mocks.parseMatchSource }));
vi.mock("@/server/auth", () => ({ isAdmin: mocks.isAdmin }));

import { parseMatchAction, saveMatchAction, type MatchEntryState } from "./actions";

const participants = ["hmx", "xiaop", "NAGA", "Mortal"].map((id) => ({
  id,
  displayName: id,
  kind: id === "hmx" || id === "xiaop" ? "human" as const : "ai" as const,
  color: "#000000",
  usernames: [id],
}));

const competition: Competition = {
  id: "1st-xrc",
  name: "1st XRC",
  code: "1ST-XRC",
  status: "active",
  plannedMatchCount: 50,
  initialPoints: 25000,
  rankPoints: [30, 10, -10, -30],
  participants,
  matches: [{
    id: "1st-xrc-001",
    matchNumber: 1,
    status: "completed",
    playedAt: "2026-08-28T15:00:00+08:00",
    tenhouLogId: "2026082815gm-0009-1940-4909b685",
    tenhouUrl: "https://tenhou.net/3/?log=2026082815gm-0009-1940-4909b685",
    nagaUrl: null,
    seats: participants.map((participant, seat) => ({
      seat: seat as 0 | 1 | 2 | 3,
      participantId: participant.id,
      sourceUsername: participant.id,
      rawPoints: 25000,
      rank: (seat + 1) as 1 | 2 | 3 | 4,
      competitionPoints: 0,
      assignmentSource: "alias",
    })),
    reviewNote: null,
  }],
};

const preview: MatchPreview = {
  sourceUrl: "https://ricochet.cn/api/naga/proxy/htmls/report_viewer.html?report_id=reportv2_2",
  sourceType: "naga",
  logId: competition.matches[0].tenhouLogId,
  tenhouUrl: competition.matches[0].tenhouUrl,
  nagaUrl: "https://ricochet.cn/api/naga/proxy/htmls/report_viewer.html?report_id=reportv2_2",
  nagaReportId: "reportv2_2",
  nagaRatings: participants.flatMap((_, seat) => ["ニシキ", "カガシ"].map((model) => ({
    seat: seat as 0 | 1 | 2 | 3,
    model,
    rating: 90,
    agreementRate: 0.8,
    badMoveRate: 0.05,
    decisionCount: 100,
  }))),
  playedAt: competition.matches[0].playedAt,
  seats: competition.matches[0].seats.map((seat) => ({ ...seat })),
};

const idleState: MatchEntryState = {
  status: "idle",
  message: "",
  preview: null,
  operation: null,
  targetMatchNumber: null,
};

describe("saveMatchAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCompetition.mockResolvedValue(competition);
    mocks.listCompetitions.mockResolvedValue([competition]);
    mocks.parseMatchSource.mockResolvedValue(preview);
    mocks.isAdmin.mockResolvedValue(true);
    mocks.supplementMatchNagaAnalysis.mockResolvedValue(undefined);
  });

  it("lets Next.js handle the redirect after a successful NAGA supplement", async () => {
    const formData = new FormData();
    formData.set("competitionId", competition.id);
    formData.set("sourceUrl", preview.sourceUrl);

    await expect(saveMatchAction(idleState, formData)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.supplementMatchNagaAnalysis).toHaveBeenCalledOnce();
    expect(mocks.appendMatch).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
    expect(mocks.redirect).toHaveBeenCalledWith("/competitions/1st-xrc");
  });

  it("loads the competition selected by the form", async () => {
    const otherCompetition = { ...competition, id: "1st-rc", matches: [] };
    mocks.getCompetition.mockResolvedValue(otherCompetition);
    mocks.listCompetitions.mockResolvedValue([otherCompetition]);
    const otherPreview = { ...preview, logId: "2026083002gm-0009-1940-70cdb106" };
    mocks.parseMatchSource.mockResolvedValue(otherPreview);
    const formData = new FormData();
    formData.set("competitionId", otherCompetition.id);
    formData.set("sourceUrl", otherPreview.sourceUrl);

    const state = await parseMatchAction(idleState, formData);

    expect(mocks.getCompetition).toHaveBeenCalledWith("1st-rc");
    expect(mocks.parseMatchSource).toHaveBeenCalledWith(otherPreview.sourceUrl, otherCompetition);
    expect(state.status).toBe("success");
    expect(state.operation).toBe("create");
  });

  it("rejects visitors before reading or writing match data", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const formData = new FormData();
    formData.set("competitionId", competition.id);
    formData.set("sourceUrl", preview.sourceUrl);

    const parseState = await parseMatchAction(idleState, formData);
    const saveState = await saveMatchAction(idleState, formData);

    expect(parseState.message).toBe("需要管理员登录");
    expect(saveState.message).toBe("需要管理员登录");
    expect(mocks.parseMatchSource).not.toHaveBeenCalled();
    expect(mocks.appendMatch).not.toHaveBeenCalled();
    expect(mocks.supplementMatchNagaAnalysis).not.toHaveBeenCalled();
  });
});
