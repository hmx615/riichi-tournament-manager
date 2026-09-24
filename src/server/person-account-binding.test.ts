import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/domain/types";

const { testDirectory } = vi.hoisted(() => ({ testDirectory: "/tmp/riichi-person-binding-test" }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/cloudflare-storage", () => ({ usesD1Storage: () => false, tournamentDatabase: vi.fn() }));
vi.mock("@/server/data-directory", () => ({ dataDirectory: testDirectory }));
vi.mock("@/server/competition-repository", () => ({ listCompetitions: vi.fn().mockResolvedValue([]) }));

import { listPeople, rememberPersonAccounts } from "./person-repository";
import { participantCandidates, resolveTableParticipants } from "@/domain/participant-matching";
import { personAccountBindings } from "@/domain/person-accounts";

const person: Person = {
  id: "赵得华",
  displayName: "中華有为",
  kind: "human",
  color: "#168f83",
  aliases: ["中華有为"],
  accounts: [{ platform: "majsoul", username: "陈黑水" }],
};

const other: Person = {
  id: "彭虹清",
  displayName: "越山逐月",
  kind: "human",
  color: "#d1495b",
  aliases: ["越山逐月"],
  accounts: [],
};

describe("手工匹配后回写账号", () => {
  beforeEach(async () => {
    await fs.rm(testDirectory, { recursive: true, force: true });
    await fs.mkdir(testDirectory, { recursive: true });
    await fs.writeFile(path.join(testDirectory, "people.json"), `${JSON.stringify([person, other], null, 2)}\n`);
  });

  it("把手工指认的昵称写进人物账号，之后同平台牌谱能自动匹配", async () => {
    // 天凤牌谱里出现一个谁都没登记的昵称：先注意它此时匹配不到人
    const before = personAccountBindings([{ personId: person.id, sourceUsername: "未知の雀士" }], "tenhou");
    const roster = (people: Person[]) => ({
      participants: people.map((item, index) => ({
        id: `player-${index + 1}`, personId: item.id, displayName: item.displayName,
        kind: item.kind, color: item.color, usernames: [item.displayName, ...item.aliases, ...item.accounts.map((account) => account.username)],
      })),
    }) as never;
    expect(participantCandidates(roster([person, other]), "未知の雀士", [person, other], "tenhou")).toEqual([]);

    await rememberPersonAccounts(before);

    const people = await listPeople();
    const updated = people.find((item) => item.id === person.id)!;
    expect(updated.accounts).toContainEqual({ platform: "tenhou", username: "未知の雀士" });
    // 下一次同平台牌谱：这个昵称直接匹配到本人
    expect(participantCandidates(roster(people), "未知の雀士", people, "tenhou")).toEqual(["player-1"]);
    const seats = resolveTableParticipants(roster([...people]), ["未知の雀士", "越山逐月", "x", "y"], people, "tenhou");
    expect(seats[0].participantId).toBe("player-1");
  });

  it("识别不出平台时记为「其他账号」，不会误标成天凤", async () => {
    await rememberPersonAccounts(personAccountBindings([{ personId: other.id, sourceUsername: "某个昵称" }], null));
    const updated = (await listPeople()).find((item) => item.id === other.id)!;
    expect(updated.accounts).toEqual([{ platform: "other", username: "某个昵称" }]);
  });

  it("同一个人物同一账号不会重复写入", async () => {
    const binding = personAccountBindings([{ personId: person.id, sourceUsername: "重复昵称" }], "majsoul");
    await rememberPersonAccounts(binding);
    await rememberPersonAccounts(binding);
    const updated = (await listPeople()).find((item) => item.id === person.id)!;
    expect(updated.accounts.filter((account) => account.username === "重复昵称")).toHaveLength(1);
  });
});
