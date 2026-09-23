import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("person tag repository", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "riichi-person-tags-"));
    await fs.mkdir(path.join(mocks.dataDirectory, "competitions"));
    await fs.writeFile(path.join(mocks.dataDirectory, "person-tags.json"), JSON.stringify(["国企办公厅", "校队"]));
    await fs.writeFile(path.join(mocks.dataDirectory, "people.json"), JSON.stringify([
      { id: "human", kind: "human", tags: ["国企办公厅", "校队"] },
      { id: "ai", kind: "ai", tags: ["国企办公厅"] },
    ]));
    await fs.writeFile(path.join(mocks.dataDirectory, "competitions", "match-pool.json"), JSON.stringify({
      id: "match-pool",
      autoIncludePersonTags: ["国企办公厅", "校队"],
    }));
  });

  afterEach(async () => {
    await fs.rm(mocks.dataDirectory, { recursive: true, force: true });
  });

  it("creates normalized unique definitions", async () => {
    const repository = await import("./person-tag-repository");
    await expect(repository.createPersonTag("  新人  ")).resolves.toBe("新人");
    expect(await repository.listPersonTags()).toEqual(["国企办公厅", "校队", "新人"]);
    await expect(repository.createPersonTag("新人")).rejects.toThrow("已存在");
  });

  it("deletes a definition and removes it from every person and the match pool rule", async () => {
    const repository = await import("./person-tag-repository");
    await repository.deletePersonTag("国企办公厅");
    expect(await repository.listPersonTags()).toEqual(["校队"]);
    expect(JSON.parse(await fs.readFile(path.join(mocks.dataDirectory, "people.json"), "utf8"))).toEqual([
      { id: "human", kind: "human", tags: ["校队"] },
      { id: "ai", kind: "ai", tags: [] },
    ]);
    expect(JSON.parse(await fs.readFile(path.join(mocks.dataDirectory, "competitions", "match-pool.json"), "utf8")))
      .toEqual({ id: "match-pool", autoIncludePersonTags: ["校队"] });
  });

  it("rejects invalid and missing definitions without changing data", async () => {
    const repository = await import("./person-tag-repository");
    await expect(repository.createPersonTag("含,逗号")).rejects.toThrow("不能包含逗号");
    await expect(repository.deletePersonTag("不存在")).rejects.toThrow("不存在或已经删除");
    expect(await repository.listPersonTags()).toEqual(["国企办公厅", "校队"]);
  });
});
