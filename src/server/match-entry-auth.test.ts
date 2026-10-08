import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  currentPlayer: vi.fn(),
  redirect: vi.fn(),
  getCompetition: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/server/player-auth", () => ({ currentPlayer: mocks.currentPlayer }));
vi.mock("@/server/competition-repository", () => ({ getCompetition: mocks.getCompetition }));
import { canEnterCompetitionMatches, competitionMatchEntryError, enterableTablesForViewer, requireCompetitionMatchEntryPage } from "./match-entry-auth";

describe("比赛牌谱录入权限", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockResolvedValue(false);
    mocks.currentPlayer.mockResolvedValue(null);
  });

  it("允许管理员录入任意比赛", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    await expect(canEnterCompetitionMatches("other-competition")).resolves.toBe(true);
    expect(mocks.currentPlayer).not.toHaveBeenCalled();
  });

  it("选手账号可以进比赛牌谱录入页（实际能录哪桌由 competitionMatchEntryError 把关）", async () => {
    mocks.currentPlayer.mockResolvedValue({ id: "player-1" });
    await expect(canEnterCompetitionMatches("match-pool")).resolves.toBe(true);
    await expect(canEnterCompetitionMatches("individual-cup")).resolves.toBe(true);
    expect(mocks.isAdmin).toHaveBeenCalled();
  });

  it("不允许访客录入比赛", async () => {
    await expect(canEnterCompetitionMatches("yougua-training")).resolves.toBe(false);
  });

  it("未登录访问录入页时携带原路径跳转登录", async () => {
    await requireCompetitionMatchEntryPage("match-pool", "/competitions/match-pool/matches/new");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=%2Fcompetitions%2Fmatch-pool%2Fmatches%2Fnew");
  });
});

describe("选手只能给自己那桌录牌谱", () => {
  const table = { id: "t1", stage: "preliminary", round: 1, tableNumber: 1, scheduledAt: "2026-10-11T12:00:00Z", timezone: "Asia/Shanghai", participantIds: ["s1", "s2", "s3", "s4"], status: "scheduled" };
  const other = { ...table, id: "t2", participantIds: ["s5", "s6", "s7", "s1"] };
  const competition = {
    id: "cup", name: "启明杯", code: "CUP", format: "individual", status: "active", plannedMatchCount: 8, initialPoints: 25000, rankPoints: [30, 10, -10, -30], matches: [],
    participants: ["s1", "s2", "s3", "s4", "s5", "s6", "s7"].map((id, index) => ({ id, personId: `p-${id}`, displayName: id, kind: "human", color: "#000", usernames: [] })),
    individualSchedule: [table, other],
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockResolvedValue(false);
    mocks.currentPlayer.mockResolvedValue(null);
    mocks.getCompetition.mockResolvedValue(competition);
  });

  it("管理员不受限制", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBeNull();
    await expect(enterableTablesForViewer(competition)).resolves.toBeNull();
  });

  it("本桌选手可以录这一桌", async () => {
    mocks.currentPlayer.mockResolvedValue({ id: "u1", personId: "p-s2" });
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBeNull();
  });

  it("挡住别人那桌——这是回归测试，防止选手替别人提交成绩", async () => {
    mocks.currentPlayer.mockResolvedValue({ id: "u5", personId: "p-s5" });
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBe("只能录入自己所在桌次的牌谱");
  });

  it("未登录、没绑人物、桌次不存在都挡住", async () => {
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBe("请先登录后再录入牌谱");
    mocks.currentPlayer.mockResolvedValue({ id: "u9", personId: null });
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBe("该账号还没有绑定人物，请联系管理员绑定后再录入");
    mocks.currentPlayer.mockResolvedValue({ id: "u1", personId: "p-s1" });
    await expect(competitionMatchEntryError(competition, "不存在")).resolves.toBe("请从具体赛程卡片选择要录入的对局");
  });

  it("桌次选择页只给自己那几桌", async () => {
    mocks.currentPlayer.mockResolvedValue({ id: "u1", personId: "p-s1" });
    // s1 同时在 t1 和 t2 里。
    await expect(enterableTablesForViewer(competition)).resolves.toEqual(new Set(["t1", "t2"]));
    mocks.currentPlayer.mockResolvedValue({ id: "u2", personId: "p-s6" });
    await expect(enterableTablesForViewer(competition)).resolves.toEqual(new Set(["t2"]));
  });

  it("四人赛沿用旧口径：选手可录，不按桌次隔离", async () => {
    mocks.currentPlayer.mockResolvedValue({ id: "u1", personId: "p-s1" });
    const fourPlayer = { ...competition, format: "four_player", individualSchedule: undefined } as any;
    await expect(competitionMatchEntryError(fourPlayer, "")).resolves.toBeNull();
  });
});
