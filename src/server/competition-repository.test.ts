import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Competition } from "@/domain/types";

vi.mock("server-only", () => ({}));
vi.mock("@/server/cloudflare-storage", () => ({
  usesD1Storage: () => false,
  tournamentDatabase: vi.fn(),
}));
vi.mock("@/server/data-directory", () => ({ dataDirectory: process.env.DATA_DIRECTORY }));

const originalDataDirectory = process.env.DATA_DIRECTORY;
const originalStorageBackend = process.env.STORAGE_BACKEND;
let temporaryDirectory: string;

const competition: Competition = {
  id: "delete-test",
  name: "Delete Test",
  code: "DELETE-TEST",
  status: "draft",
  plannedMatchCount: 1,
  initialPoints: 25000,
  rankPoints: [30, 10, -10, -30],
  participants: [],
  matches: [],
};

describe("competition deletion", () => {
  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "riichi-delete-test-"));
    process.env.DATA_DIRECTORY = temporaryDirectory;
    process.env.STORAGE_BACKEND = "file";
    vi.resetModules();
  });

  afterEach(async () => {
    if (originalDataDirectory === undefined) delete process.env.DATA_DIRECTORY;
    else process.env.DATA_DIRECTORY = originalDataDirectory;
    if (originalStorageBackend === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = originalStorageBackend;
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("backs up the complete competition before deleting it", async () => {
    const repository = await import("./competition-repository");
    await repository.createCompetition(competition);

    await repository.deleteCompetition(competition.id);

    await expect(repository.getCompetition(competition.id)).resolves.toBeNull();
    const backupDirectory = path.join(temporaryDirectory, "backups", "competitions");
    const backups = await fs.readdir(backupDirectory);
    expect(backups).toHaveLength(1);
    expect(JSON.parse(await fs.readFile(path.join(backupDirectory, backups[0]), "utf8"))).toEqual(competition);
  });

  it("persists completion together with the match and reopens the table after deletion", async () => {
    const repository = await import("./competition-repository");
    const registered: Competition = { ...competition, format: "individual", individualSchedule: [{ id: "s1", stage: "preliminary", round: 1, tableNumber: 1, scheduledAt: "2026-09-12T12:00:00Z", timezone: "Asia/Shanghai", participantIds: ["a", "b", "c", "d"], status: "scheduled" }] };
    await repository.createCompetition(registered);
    const match: import("@/domain/types").MatchRecord = { id: "m1", matchNumber: 1, scheduleId: "s1", status: "completed", playedAt: "2026-09-12T12:00:00Z", tenhouLogId: "log1", tenhouUrl: "", nagaUrl: null, reviewNote: null,
      seats: ["a", "b", "c", "d"].map((id, seat) => ({ seat: seat as 0 | 1 | 2 | 3, participantId: id, sourceUsername: id, rank: (seat + 1) as 1 | 2 | 3 | 4, rawPoints: 25000, competitionPoints: 0, assignmentSource: "manual" })),
    };
    await repository.appendMatch(registered.id, match);
    const stored = await repository.getCompetition(registered.id);
    expect(stored?.matches[0]).toMatchObject({ scheduleId: "s1", stage: "preliminary", round: 1, tableNumber: 1 });
    expect(stored?.individualSchedule?.[0]).toMatchObject({ status: "completed", matchNumber: 1 });
    await expect(repository.appendMatch(registered.id, { ...match, id: "m2", matchNumber: 2, tenhouLogId: "log2" })).rejects.toThrow("已经录入");
    expect((await repository.getCompetition(registered.id))?.matches).toHaveLength(1);
    await repository.deleteMatch(registered.id, 1);
    const reopened = await repository.getCompetition(registered.id);
    expect(reopened?.individualSchedule?.[0]).toMatchObject({ status: "scheduled" });
    expect(reopened?.individualSchedule?.[0].matchNumber).toBeUndefined();
  });
});
