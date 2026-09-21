import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubRegistrationInput } from "@/domain/club-registration";

const mocks = vi.hoisted(() => ({
  dataDirectory: "",
  usesD1Storage: vi.fn(() => false),
  tournamentDatabase: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/data-directory", () => ({ get dataDirectory() { return mocks.dataDirectory; } }));
vi.mock("@/server/cloudflare-storage", () => ({
  usesD1Storage: mocks.usesD1Storage,
  tournamentDatabase: mocks.tournamentDatabase,
}));

const registration: ClubRegistrationInput = {
  studentId: "20260001",
  nickname: "测试选手",
  qq: "123456789",
  currentRank: "雀杰1",
  otherPlatformRank: "天凤七段",
  majsoulNickname: "TestPlayer",
  majsoulId: "987654321",
  goals: "提高牌效和防守判断",
  ownsMajsoulAccount: "on",
  privacyConsent: "on",
};

describe("club registration storage", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "riichi-club-registration-"));
    mocks.usesD1Storage.mockReturnValue(false);
  });

  afterEach(async () => {
    await fs.rm(mocks.dataDirectory, { recursive: true, force: true });
  });

  it("只删除指定登记记录", async () => {
    const repository = await import("./club-registration-repository");
    const first = await repository.createClubRegistration(registration);
    const second = await repository.createClubRegistration({
      ...registration,
      studentId: "20260002",
      majsoulId: "987654322",
    });

    await expect(repository.deleteClubRegistration(first.id)).resolves.toBe(true);
    await expect(repository.deleteClubRegistration(first.id)).resolves.toBe(false);
    await expect(repository.listClubRegistrations()).resolves.toEqual([second]);
  });

  it("兼容缺少新增字段的旧本地记录", async () => {
    const legacy = {
      id: crypto.randomUUID(),
      studentId: "20250001",
      nickname: "旧记录",
      qq: "123456780",
      majsoulId: "123456780",
      currentRank: "雀士1",
      goals: "测试旧数据兼容",
      ownsMajsoulAccount: true,
      privacyConsent: true,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(mocks.dataDirectory, "club-registrations.json"), JSON.stringify([legacy]));
    const repository = await import("./club-registration-repository");
    const [loaded] = await repository.listClubRegistrations();
    expect(loaded.otherPlatformRank).toBe("");
    expect(loaded.majsoulNickname).toBe("");
  });
});
