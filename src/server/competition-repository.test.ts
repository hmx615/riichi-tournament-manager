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
});
