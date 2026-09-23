import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  currentPlayer: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/server/player-auth", () => ({ currentPlayer: mocks.currentPlayer }));
import { canEnterCompetitionMatches, requireCompetitionMatchEntryPage } from "./match-entry-auth";

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
