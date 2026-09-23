import { beforeEach, describe, expect, it, vi } from "vitest";
import { SNAPSHOT_REVISION } from "./stats-snapshot";

const mocks = vi.hoisted(() => ({
  usesD1Storage: vi.fn(() => true),
  tournamentDatabase: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/cloudflare-storage", () => ({ usesD1Storage: mocks.usesD1Storage, tournamentDatabase: mocks.tournamentDatabase }));

type Row = { version: string; document: string };

// 人物与牌谱缓存槽位保留为占位符，以兼容线上已有的七段式版本号。
const versionKey = (value: string) => [String(SNAPSHOT_REVISION), value, 1, "*", "*", "*", "*"].join("|");
const legacyVersionKey = (value: string) => [String(SNAPSHOT_REVISION), value, 1, "person-time", 13, value, 1].join("|");

function fakeDatabase({ version = "v1", row = null as Row | null } = {}) {
  const statements: string[] = [];
  const rows = new Map<string, Row>();
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      const isVersionQuery = sql.includes("FROM competitions) AS competitionUpdatedAt");
      const isSelect = sql.startsWith("SELECT version, document");
      const isUpsert = sql.startsWith("INSERT INTO stats_snapshots");
      const build = (args: unknown[]) => ({
        async first() {
          if (isVersionQuery) return { competitionUpdatedAt: version, competitionCount: 1, logCreatedAt: version, logCount: 1 };
          // 预置的旧快照对任意 id 都返回一次，模拟"库里已有一条记录"。
          if (isSelect) return rows.get(args[0] as string) ?? row;
          return null;
        },
        async run() {
          if (isUpsert) rows.set(args[0] as string, { version: args[1] as string, document: args[2] as string });
          return { success: true };
        },
      });
      return { ...build([]), bind: (...args: unknown[]) => build(args) };
    },
  };
  return { db, statements, rows };
}

describe("cachedSnapshot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.usesD1Storage.mockReturnValue(true);
  });

  it("本地文件仓储直接计算，不碰 D1", async () => {
    mocks.usesD1Storage.mockReturnValue(false);
    const { cachedSnapshot } = await import("./stats-snapshot");
    const compute = vi.fn(async () => ({ value: 1 }));
    expect(await cachedSnapshot("k", compute)).toEqual({ value: 1 });
    expect(await cachedSnapshot("k", compute)).toEqual({ value: 1 });
    expect(compute).toHaveBeenCalledTimes(2);
    expect(mocks.tournamentDatabase).not.toHaveBeenCalled();
  });

  it("首次计算后写入快照，第二次命中 isolate 内存不再重算", async () => {
    const { db, rows } = fakeDatabase();
    mocks.tournamentDatabase.mockResolvedValue(db);
    const { cachedSnapshot } = await import("./stats-snapshot");
    const compute = vi.fn(async () => ({ value: 42 }));
    expect(await cachedSnapshot("person-statistics-v1", compute)).toEqual({ value: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(rows.get("person-statistics-v1")?.document).toBe(JSON.stringify({ value: 42 }));
    expect(await cachedSnapshot("person-statistics-v1", compute)).toEqual({ value: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("版本不一致时忽略旧快照并重算", async () => {
    const { db, rows } = fakeDatabase({ version: "v2", row: { version: versionKey("v1"), document: JSON.stringify({ value: 1 }) } });
    mocks.tournamentDatabase.mockResolvedValue(db);
    const { cachedSnapshot } = await import("./stats-snapshot");
    const compute = vi.fn(async () => ({ value: 2 }));
    expect(await cachedSnapshot("k", compute)).toEqual({ value: 2 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(rows.get("k")?.version).toBe(versionKey("v2"));
  });

  it("人物表与牌谱缓存都不参与统计版本，并兼容已有快照", async () => {
    const { db, statements } = fakeDatabase({
      version: "v3",
      row: { version: legacyVersionKey("v3"), document: JSON.stringify({ value: 7 }) },
    });
    mocks.tournamentDatabase.mockResolvedValue(db);
    const { cachedSnapshot } = await import("./stats-snapshot");
    const compute = vi.fn(async () => ({ value: 8 }));
    expect(await cachedSnapshot("k", compute)).toEqual({ value: 7 });
    expect(compute).not.toHaveBeenCalled();
    const versionSql = statements.find((sql) => sql.includes("FROM competitions) AS competitionUpdatedAt"));
    expect(versionSql).not.toContain("FROM people");
    expect(versionSql).not.toContain("FROM logs");
  });

  it("版本一致时直接复用 D1 快照，不重算", async () => {
    const { db } = fakeDatabase({ version: "v3", row: { version: versionKey("v3"), document: JSON.stringify({ value: 7 }) } });
    mocks.tournamentDatabase.mockResolvedValue(db);
    const { cachedSnapshot } = await import("./stats-snapshot");
    const compute = vi.fn(async () => ({ value: 8 }));
    expect(await cachedSnapshot("k", compute)).toEqual({ value: 7 });
    expect(compute).not.toHaveBeenCalled();
  });

  it("自定义版本源只控制自己的快照，不读取正式比赛版本", async () => {
    const { db, statements, rows } = fakeDatabase();
    mocks.tournamentDatabase.mockResolvedValue(db);
    const { cachedSnapshot } = await import("./stats-snapshot");
    const compute = vi.fn(async () => ({ value: "casual" }));
    const casualVersion = vi.fn(async () => "casual-v1");

    expect(await cachedSnapshot("casual-statistics-v1", compute, casualVersion)).toEqual({ value: "casual" });
    expect(casualVersion).toHaveBeenCalledTimes(1);
    expect(statements.some((sql) => sql.includes("FROM competitions) AS competitionUpdatedAt"))).toBe(false);
    expect(rows.get("casual-statistics-v1")?.version).toBe("casual-v1");
  });

  it("快照损坏时回退到重算", async () => {
    const { db } = fakeDatabase({ version: "v4", row: { version: versionKey("v4"), document: "{坏数据" } });
    mocks.tournamentDatabase.mockResolvedValue(db);
    const { cachedSnapshot } = await import("./stats-snapshot");
    const compute = vi.fn(async () => ({ value: 9 }));
    expect(await cachedSnapshot("k", compute)).toEqual({ value: 9 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("D1 读取异常时仍能算出结果", async () => {
    mocks.tournamentDatabase.mockRejectedValue(new Error("D1 挂了"));
    const { cachedSnapshot } = await import("./stats-snapshot");
    const compute = vi.fn(async () => ({ value: 10 }));
    expect(await cachedSnapshot("k", compute)).toEqual({ value: 10 });
  });
});
