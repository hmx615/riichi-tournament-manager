import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Competition } from "@/domain/types";
import type { MatchPreview } from "@/server/tenhou";

const mocks = vi.hoisted(() => ({
  appendMatch: vi.fn(),
  getCompetition: vi.fn(),
  listCompetitions: vi.fn(),
  supplementMatchNagaAnalysis: vi.fn(),
  parseCachedMajsoulSource: vi.fn(),
  parseMajsoulJsonSource: vi.fn(),
  parseMatchSource: vi.fn(),
  readCachedLogs: vi.fn(),
  matchContentFingerprint: vi.fn(),
  isAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/domain/tenhou-log-normalizer", () => ({ matchContentFingerprint: mocks.matchContentFingerprint }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/competition-repository", () => ({
  appendMatch: mocks.appendMatch,
  getCompetition: mocks.getCompetition,
  listCompetitions: mocks.listCompetitions,
  supplementMatchNagaAnalysis: mocks.supplementMatchNagaAnalysis,
}));
vi.mock("@/server/tenhou", () => ({
  parseCachedMajsoulSource: mocks.parseCachedMajsoulSource,
  parseMajsoulJsonSource: mocks.parseMajsoulJsonSource,
  parseMatchSource: mocks.parseMatchSource,
  readCachedLogs: mocks.readCachedLogs,
}));
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
  contentFingerprint: "match-fingerprint",
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
    mocks.readCachedLogs.mockResolvedValue(new Map());
    mocks.matchContentFingerprint.mockResolvedValue("different-fingerprint");
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

  it("parses an uploaded Majsoul JSON file", async () => {
    const majsoulPreview = {
      ...preview,
      sourceUrl: "",
      sourceType: "majsoul" as const,
      logId: "majsoul-0123456789abcdef0123456789abcdef",
      tenhouUrl: "",
      nagaUrl: null,
      nagaReportId: null,
      nagaRatings: [],
    };
    mocks.parseMajsoulJsonSource.mockResolvedValue(majsoulPreview);
    mocks.listCompetitions.mockResolvedValue([]);
    const formData = new FormData();
    formData.set("competitionId", competition.id);
    formData.set("sourceKind", "majsoul_json");
    formData.set("majsoulJson", new File(["{\"name\":[]}"], "match.json", { type: "application/json" }));

    const state = await parseMatchAction(idleState, formData);

    expect(mocks.parseMajsoulJsonSource).toHaveBeenCalledWith("{\"name\":[]}", competition);
    expect(state.status).toBe("success");
    expect(state.preview?.sourceType).toBe("majsoul");
  });

  it("parses pasted Majsoul JSON text", async () => {
    const majsoulPreview = {
      ...preview,
      sourceUrl: "",
      sourceType: "majsoul" as const,
      logId: "majsoul-fedcba9876543210fedcba9876543210",
      tenhouUrl: "",
      nagaUrl: null,
      nagaReportId: null,
      nagaRatings: [],
    };
    mocks.parseMajsoulJsonSource.mockResolvedValue(majsoulPreview);
    mocks.listCompetitions.mockResolvedValue([]);
    const formData = new FormData();
    formData.set("competitionId", competition.id);
    formData.set("sourceKind", "majsoul_json");
    formData.set("majsoulJsonText", "  {\"name\":[]}  ");

    const state = await parseMatchAction(idleState, formData);

    expect(mocks.parseMajsoulJsonSource).toHaveBeenCalledWith("{\"name\":[]}", competition);
    expect(state.status).toBe("success");
  });

  it("matches a NAGA custom report to an existing Majsoul JSON by content hash", async () => {
    const hash = "0123456789abcdef0123456789abcdef";
    const majsoulMatch = {
      ...competition.matches[0],
      tenhouLogId: `majsoul-${hash}`,
      tenhouUrl: "",
      sourceType: "majsoul" as const,
    };
    const nagaPreview = { ...preview, logId: `naga-custom-${hash}` };
    const majsoulCompetition = { ...competition, matches: [majsoulMatch] };
    mocks.getCompetition.mockResolvedValue(majsoulCompetition);
    mocks.listCompetitions.mockResolvedValue([majsoulCompetition]);
    mocks.parseMatchSource.mockResolvedValue(nagaPreview);
    const formData = new FormData();
    formData.set("competitionId", competition.id);
    formData.set("sourceUrl", nagaPreview.sourceUrl);

    await expect(saveMatchAction(idleState, formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.supplementMatchNagaAnalysis).toHaveBeenCalledWith(
      competition.id,
      `majsoul-${hash}`,
      nagaPreview.nagaUrl,
      nagaPreview.nagaReportId,
      expect.any(Array),
    );
    expect(mocks.appendMatch).not.toHaveBeenCalled();
  });

  it("rejects a Majsoul JSON when the semantic match already has NAGA analysis", async () => {
    const existingMatch = {
      ...competition.matches[0],
      tenhouLogId: "naga-custom-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contentFingerprint: "same-semantic-game",
      nagaUrl: preview.nagaUrl,
    };
    const existingCompetition = { ...competition, matches: [existingMatch] };
    const majsoulPreview = {
      ...preview,
      sourceUrl: "",
      sourceType: "majsoul" as const,
      logId: "majsoul-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      contentFingerprint: "same-semantic-game",
      tenhouUrl: "",
      nagaUrl: null,
      nagaReportId: null,
      nagaRatings: [],
    };
    mocks.getCompetition.mockResolvedValue(existingCompetition);
    mocks.listCompetitions.mockResolvedValue([existingCompetition]);
    mocks.parseMajsoulJsonSource.mockResolvedValue(majsoulPreview);
    const formData = new FormData();
    formData.set("competitionId", competition.id);
    formData.set("sourceKind", "majsoul_json");
    formData.set("majsoulJsonText", "{}");

    const state = await parseMatchAction(idleState, formData);

    expect(state.status).toBe("error");
    expect(state.message).toBe("该牌谱已录入第 1 场且已有 NAGA 分析，无需补充 JSON");
    expect(mocks.appendMatch).not.toHaveBeenCalled();
  });
});
