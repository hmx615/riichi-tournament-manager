import { describe, expect, it, vi } from "vitest";
import type { Competition } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  listPeople: vi.fn(async () => []),
  normalizeMajsoulJson: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/cloudflare-storage", () => ({ usesD1Storage: () => false, tournamentDatabase: vi.fn() }));
vi.mock("@/server/data-directory", () => ({ dataDirectory: "/tmp/riichi-tenhou-storage-test" }));
vi.mock("@/server/person-repository", () => ({ listPeople: mocks.listPeople }));
vi.mock("@/domain/majsoul-json", () => ({ normalizeMajsoulJson: mocks.normalizeMajsoulJson }));

import { parseMajsoulJsonSource, parseMatchSource, type MatchLogStorage, type TenhouLog } from "./tenhou";

const competition: Competition = {
  id: "casual-rank",
  name: "散排",
  code: "CASUAL",
  status: "active",
  plannedMatchCount: 0,
  initialPoints: 25000,
  rankPoints: [30, 10, -10, -30],
  participants: [],
  matches: [],
};

const log: TenhouLog = {
  ref: "2026092115gm-0089-0000-83fe761a",
  name: ["a", "b", "c", "d"],
  sc: [40000, 0, 30000, 0, 20000, 0, 10000, 0],
  log: [],
};

function storageWith(logValue: TenhouLog | null): MatchLogStorage & { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> } {
  return {
    read: vi.fn(async () => logValue),
    write: vi.fn(async () => undefined),
  };
}

describe("牌谱解析缓存隔离", () => {
  it("天凤链接从调用方指定的缓存读取", async () => {
    const storage = storageWith(log);
    const preview = await parseMatchSource(`https://tenhou.net/3/?log=${log.ref}`, competition, storage);

    expect(storage.read).toHaveBeenCalledWith(log.ref);
    expect(storage.write).not.toHaveBeenCalled();
    expect(preview.logId).toBe(log.ref);
  });

  it("雀魂 JSON 写入调用方指定的缓存", async () => {
    const majsoulLog = { ...log, ref: "majsoul-0123456789abcdef0123456789abcdef", sourcePlatform: "majsoul" as const };
    mocks.normalizeMajsoulJson.mockResolvedValue(majsoulLog);
    const storage = storageWith(null);

    const preview = await parseMajsoulJsonSource("{}", competition, storage);

    expect(storage.write).toHaveBeenCalledWith(majsoulLog);
    expect(preview.logId).toBe(majsoulLog.ref);
  });
});
