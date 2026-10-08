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
import { canEnterCompetitionMatches, competitionMatchEntryError, requireCompetitionMatchEntryPage } from "./match-entry-auth";

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

  it("允许选手账号录入任意现有比赛", async () => {
    mocks.currentPlayer.mockResolvedValue({ id: "player-1" });
    await expect(canEnterCompetitionMatches("match-pool")).resolves.toBe(true);
    await expect(canEnterCompetitionMatches("yougua-training")).resolves.toBe(true);
    await expect(canEnterCompetitionMatches("individual-cup")).resolves.toBe(true);
  });

  it("不允许访客录入比赛", async () => {
    await expect(canEnterCompetitionMatches("yougua-training")).resolves.toBe(false);
    expect(mocks.currentPlayer).toHaveBeenCalledOnce();
  });

  it("未登录访问录入页时携带原路径跳转登录", async () => {
    await requireCompetitionMatchEntryPage("match-pool", "/competitions/match-pool/matches/new");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=%2Fcompetitions%2Fmatch-pool%2Fmatches%2Fnew");
  });
});

describe("个人赛按桌次隔离录入权限", () => {
  const table = { id: "t1", stage: "preliminary", round: 1, tableNumber: 1, scheduledAt: "2026-10-11T12:00:00Z", timezone: "Asia/Shanghai", participantIds: ["s1", "s2", "s3", "s4"], status: "scheduled" };
  const competition = {
    id: "cup", name: "启明杯", code: "CUP", format: "individual", status: "active", plannedMatchCount: 8, initialPoints: 25000, rankPoints: [30, 10, -10, -30], matches: [],
    participants: [
      { id: "s1", personId: "p-1", displayName: "甲", kind: "human", color: "#000", usernames: [] },
      { id: "s2", personId: "p-2", displayName: "乙", kind: "human", color: "#000", usernames: [] },
      { id: "s3", personId: "p-3", displayName: "丙", kind: "human", color: "#000", usernames: [] },
      { id: "s4", personId: "p-4", displayName: "丁", kind: "human", color: "#000", usernames: [] },
      { id: "s5", personId: "p-5", displayName: "戊", kind: "human", color: "#000", usernames: [] },
    ],
    individualSchedule: [table],
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockResolvedValue(false);
    mocks.currentPlayer.mockResolvedValue(null);
    mocks.getCompetition.mockResolvedValue(competition);
  });

  it("管理员可以录任意桌次", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBeNull();
    await expect(competitionMatchEntryError(competition, "不存在")).resolves.toBeNull();
  });

  it("本桌选手可以录这一桌", async () => {
    mocks.currentPlayer.mockResolvedValue({ id: "u1", personId: "p-3" });
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBeNull();
  });

  it("挡住不在本桌的选手——这是回归测试，防止有人替别人那桌录成绩", async () => {
    mocks.currentPlayer.mockResolvedValue({ id: "u5", personId: "p-5" });
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBe("只能录入自己所在桌次的牌谱");
  });

  it("未登录、账号没绑人物、桌次不存在都挡住", async () => {
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBe("当前账号没有该比赛的牌谱录入权限");
    mocks.currentPlayer.mockResolvedValue({ id: "u9", personId: null });
    await expect(competitionMatchEntryError(competition, "t1")).resolves.toBe("该账号还没有绑定人物，请联系管理员绑定后再录入");
    mocks.currentPlayer.mockResolvedValue({ id: "u1", personId: "p-1" });
    await expect(competitionMatchEntryError(competition, "没有这桌")).resolves.toBe("请从具体赛程卡片选择要录入的对局");
  });

  it("四人赛沿用旧口径：选手仍可录入，不按桌次隔离", async () => {
    mocks.currentPlayer.mockResolvedValue({ id: "u1", personId: "p-1" });
    const fourPlayer = { ...competition, format: "four_player", individualSchedule: undefined } as any;
    await expect(competitionMatchEntryError(fourPlayer, "")).resolves.toBeNull();
  });
});
