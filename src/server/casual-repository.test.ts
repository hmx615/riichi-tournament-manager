import fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CasualRecord } from "@/domain/casual-record";

const { testDirectory } = vi.hoisted(() => ({ testDirectory: "/tmp/riichi-casual-repository-test" }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/cloudflare-storage", () => ({ usesD1Storage: () => false, tournamentDatabase: vi.fn() }));
vi.mock("@/server/data-directory", () => ({ dataDirectory: testDirectory }));
vi.mock("@/server/stats-snapshot", () => ({ SNAPSHOT_REVISION: 4 }));
vi.mock("@/server/tenhou", () => ({ validateTenhouLog: (value: unknown) => value }));

import { cacheCasualLog, casualDataVersion, deleteCasualRecord, findCasualRecordByLog, listCasualRecords, readCasualLog, saveCasualRecord } from "./casual-repository";

const log = { ref: "2026092012gm-0009-1940-410308be", name: ["a", "b", "c", "d"], sc: [42000, 25000, 25000, 25000, 20000, 13000, 0, 0], log: [] };

function record(id: string, logId = log.ref): CasualRecord {
  return {
    id,
    playedAt: "2026-09-20T12:00:00+08:00",
    sourceType: "tenhou",
    sourceUrl: "https://tenhou.net/3/?log=x",
    tenhouLogId: logId,
    tenhouUrl: "https://tenhou.net/3/?log=x",
    nagaUrl: null,
    nagaReportId: null,
    contentFingerprint: `fp-${id}`,
    seats: [],
    nagaRatings: [],
    createdByPersonId: "wdj",
    createdByUsername: "wdj",
    createdAt: "2026-09-20T13:00:00.000Z",
  };
}

describe("散排本地仓储", () => {
  beforeEach(async () => {
    await fs.rm(testDirectory, { recursive: true, force: true });
  });

  it("解析缓存只写入散排日志目录", async () => {
    await cacheCasualLog(log as never);
    await expect(readCasualLog(log.ref)).resolves.toMatchObject({ ref: log.ref });
    await expect(fs.stat(`${testDirectory}/logs/${log.ref}.json`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("保存后能列出、按牌谱查找并读回牌谱原文", async () => {
    await saveCasualRecord(record("r1"), log as never);
    const records = await listCasualRecords();
    expect(records.map((item) => item.id)).toEqual(["r1"]);
    await expect(findCasualRecordByLog(log.ref)).resolves.toMatchObject({ id: "r1" });
    await expect(findCasualRecordByLog("other", "fp-r1")).resolves.toMatchObject({ id: "r1" });
    await expect(findCasualRecordByLog("other")).resolves.toBeNull();
    await expect(readCasualLog(log.ref)).resolves.toMatchObject({ ref: log.ref });
  });

  it("删除记录时一并清掉不再被引用的牌谱原文", async () => {
    await saveCasualRecord(record("r1"), log as never);
    await saveCasualRecord(record("r2"), log as never);
    await expect(deleteCasualRecord("r1")).resolves.toBe(true);
    await expect(readCasualLog(log.ref)).resolves.not.toBeNull();
    await expect(deleteCasualRecord("r2")).resolves.toBe(true);
    await expect(readCasualLog(log.ref)).resolves.toBeNull();
    await expect(deleteCasualRecord("missing")).resolves.toBe(false);
  });

  it("本地开发不做快照，版本号带 local 前缀", async () => {
    await expect(casualDataVersion()).resolves.toBe("local|4");
  });
});
