import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Competition, Person } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  tournamentDatabase: vi.fn(),
  listPeople: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/cloudflare-storage", () => ({
  usesD1Storage: () => true,
  tournamentDatabase: mocks.tournamentDatabase,
}));
vi.mock("@/server/data-directory", () => ({ dataDirectory: "/tmp/riichi-match-pool-test" }));
vi.mock("@/server/person-repository", () => ({ listPeople: mocks.listPeople }));

const person: Person = {
  id: "player",
  displayName: "新名称",
  kind: "human",
  color: "#168f83",
  aliases: ["旧名称"],
  accounts: [],
};

const storedCompetition: Competition = {
  id: "match-pool",
  name: "国企天梯赛·家妈杯",
  code: "MATCH-POOL",
  status: "active",
  plannedMatchCount: 100000,
  initialPoints: 25000,
  rankPoints: [30, 10, -10, -30],
  participants: [{
    id: "person-player",
    personId: "player",
    displayName: "旧名称",
    kind: "human",
    color: "#168f83",
    usernames: ["旧名称"],
  }],
  matches: [],
};

describe("match pool profile synchronization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.listPeople.mockResolvedValue([person]);
  });

  it("updates participant metadata without advancing the competition statistics timestamp", async () => {
    const taggedMember: Person = { ...person, id: "member", displayName: "新成员", tags: ["国企办公厅"] };
    const outsider: Person = { ...person, id: "outsider", displayName: "外部成员", tags: ["校外"] };
    mocks.listPeople.mockResolvedValue([person, taggedMember, outsider]);
    const prepared: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const record = { sql, args: [] as unknown[] };
        prepared.push(record);
        const statement = {
          bind(...args: unknown[]) { record.args = args; return statement; },
          async first() {
            if (sql.startsWith("SELECT document, version")) {
              return { document: JSON.stringify(storedCompetition), version: 7 };
            }
            return null;
          },
        };
        return statement;
      },
      batch: vi.fn(async () => [{ success: true, meta: { changes: 1 } }]),
    };
    mocks.tournamentDatabase.mockResolvedValue(db);
    const { getOrCreateMatchPool } = await import("./competition-repository");

    await getOrCreateMatchPool();

    const update = prepared.find((statement) => statement.sql.startsWith("UPDATE competitions"));
    expect(update?.sql).not.toContain("updated_at");
    expect(update?.args.slice(1)).toEqual(["match-pool", 7]);
    const document = JSON.parse(String(update?.args[0])) as Competition;
    expect(document.participants.map((participant) => participant.personId)).toEqual(["player", "member"]);
    expect(document.autoIncludePersonTags).toEqual(["国企办公厅"]);
  });
});
