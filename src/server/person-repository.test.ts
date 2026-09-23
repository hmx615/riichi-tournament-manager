import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Competition, Person } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  dataDirectory: "",
  usesD1Storage: vi.fn(() => false),
  tournamentDatabase: vi.fn(),
  listCompetitions: vi.fn(),
  synchronizeAllMatchPools: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/data-directory", () => ({ get dataDirectory() { return mocks.dataDirectory; } }));
vi.mock("@/server/cloudflare-storage", () => ({ usesD1Storage: mocks.usesD1Storage, tournamentDatabase: mocks.tournamentDatabase }));
vi.mock("@/server/competition-repository", () => ({
  listCompetitions: mocks.listCompetitions,
  synchronizeAllMatchPools: mocks.synchronizeAllMatchPools,
}));

const person: Person = { id: "明轩", displayName: "明轩", kind: "human", color: "#168f83", aliases: [], accounts: [], tags: ["国企办公厅"] };
const otherPerson: Person = { ...person, id: "other", displayName: "Other" };

describe("person deletion storage", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "riichi-person-delete-"));
    mocks.usesD1Storage.mockReturnValue(false);
    mocks.listCompetitions.mockResolvedValue([]);
    await fs.writeFile(path.join(mocks.dataDirectory, "people.json"), JSON.stringify([person, otherPerson]));
  });
  afterEach(async () => {
    await fs.rm(mocks.dataDirectory, { recursive: true, force: true });
  });

  it("backs up and deletes an unreferenced person while preserving other people", async () => {
    const repository = await import("./person-repository");
    expect(await repository.deletePerson(person.id)).toEqual(person);
    expect(await repository.listPeople()).toEqual([otherPerson]);
    const directory = path.join(mocks.dataDirectory, "backups", "people");
    const backups = await fs.readdir(directory);
    expect(backups).toHaveLength(1);
    expect(JSON.parse(await fs.readFile(path.join(directory, backups[0]), "utf8"))).toEqual(person);
  });

  it.each(["draft", "active", "completed", "archived"] as Competition["status"][])("blocks deletion of a person registered in a %s competition", async (status) => {
    mocks.listCompetitions.mockResolvedValue([{ id: "cup", name: "Test Cup", status, participants: [{ personId: person.id }] }]);
    const repository = await import("./person-repository");
    expect(await repository.personCompetitions(person.id)).toEqual([{ id: "cup", name: "Test Cup" }]);
    await expect(repository.deletePerson(person.id)).rejects.toThrow("Test Cup");
    expect(await repository.listPeople()).toEqual([person, otherPerson]);
  });

  it("rejects deleting a missing person", async () => {
    const repository = await import("./person-repository");
    await expect(repository.deletePerson("missing")).rejects.toThrow("人物不存在或已经删除");
    expect(await repository.listPeople()).toEqual([person, otherPerson]);
  });

  it("merges confirmed accounts by platform without duplication or removing profile data", async () => {
    const repository = await import("./person-repository");
    const majsoul = { personId: person.id, account: { platform: "majsoul" as const, username: "新昵称" } };
    const tenhou = { personId: person.id, account: { platform: "tenhou" as const, username: "新昵称" } };
    await repository.rememberPersonAccounts([majsoul, majsoul]);
    await repository.rememberPersonAccounts([majsoul, tenhou]);
    expect(await repository.getPerson(person.id)).toEqual({ ...person, accounts: [majsoul.account, tenhou.account] });
    expect(await repository.getPerson(otherPerson.id)).toEqual(otherPerson);
  });

  it("does not modify the local people file when a confirmed person is missing", async () => {
    const repository = await import("./person-repository");
    await expect(repository.rememberPersonAccounts([
      { personId: person.id, account: { platform: "majsoul", username: "valid" } },
      { personId: "missing", account: { platform: "majsoul", username: "invalid" } },
    ])).rejects.toThrow("参赛人物不存在");
    expect(await repository.listPeople()).toEqual([person, otherPerson]);
  });

  it.each([0, 1])("checks the D1 conditional deletion result (%i changed rows)", async (changes) => {
    mocks.usesD1Storage.mockReturnValue(true);
    const statement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ document: JSON.stringify(person), version: 7 }),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes } }),
    };
    const prepare = vi.fn().mockReturnValue(statement);
    mocks.tournamentDatabase.mockResolvedValue({ prepare });
    const repository = await import("./person-repository");
    if (changes) await expect(repository.deletePerson(person.id)).resolves.toEqual(person);
    else await expect(repository.deletePerson(person.id)).rejects.toThrow("请刷新后重试");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("AND NOT EXISTS"));
    expect(statement.bind).toHaveBeenCalledWith(person.id, 7, person.id);
  });

  it.each([
    ["avatar-only", { ...person, avatarKey: "people/test/new", avatarVersion: 2, avatarContentType: "image/png" as const }, false],
    ["Mahjong Soul rank", { ...person, majsoulRank: "雀豪2" as const }, false],
    ["profile", { ...person, displayName: "新名称" }, true],
  ])("updates %s changes without touching a statistics timestamp", async (_label, updated, syncsMatchPool) => {
    mocks.usesD1Storage.mockReturnValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T08:00:00.000Z"));
    const selectStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        document: JSON.stringify(person),
        version: 7,
      }),
    };
    const updateStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
    };
    const prepare = vi.fn((sql: string) => sql.startsWith("SELECT document") ? selectStatement : updateStatement);
    mocks.tournamentDatabase.mockResolvedValue({ prepare });

    try {
      const repository = await import("./person-repository");
      await repository.updatePerson(updated);
      expect(updateStatement.bind).toHaveBeenCalledWith(
        JSON.stringify(updated),
        "2026-09-21T08:00:00.000Z",
        person.id,
        7,
      );
      expect(prepare.mock.calls.some(([sql]) => String(sql).includes("statistics_updated_at"))).toBe(false);
      expect(mocks.synchronizeAllMatchPools).toHaveBeenCalledTimes(syncsMatchPool ? 1 : 0);
    } finally {
      vi.useRealTimers();
    }
  });
});
