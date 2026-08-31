import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { calculateNagaRatings } from "../src/domain/naga-rating";
import type { Competition, NagaRating } from "../src/domain/types";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const competitionFile = path.join(root, "data", "competitions", "1st-xrc.json");
const reportDirectory = path.join(root, "data", "naga-reports");
const backupDirectory = path.join(root, "data", "backups", "competitions");

function reportIdFromUrl(source: string) {
  const reportId = new URL(source).searchParams.get("report_id");
  if (!reportId || !/^[a-z0-9_-]+$/i.test(reportId)) throw new Error(`无法识别 NAGA 报告链接：${source}`);
  return reportId;
}

async function readReport(reportId: string) {
  const cacheFile = path.join(reportDirectory, `${reportId}.json`);
  try {
    return JSON.parse(await fs.readFile(cacheFile, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const url = `https://ricochet.cn/api/naga/proxy/reports/${encodeURIComponent(reportId)}.json.gz`;
  const { stdout } = await execFileAsync("curl", [
    "--compressed", "-L", "-sS", "--fail", "--max-time", "30",
    "-A", "Mozilla/5.0 XRC-Tournament-Manager", url,
  ], { encoding: "utf8", maxBuffer: 100 << 20 });
  const report = JSON.parse(stdout) as unknown;
  await fs.mkdir(reportDirectory, { recursive: true });
  await fs.writeFile(cacheFile, `${JSON.stringify(report)}\n`, { flag: "wx" });
  return report;
}

async function backfillMatch(match: Competition["matches"][number]) {
  if (!match.nagaUrl) throw new Error(`第 ${match.matchNumber} 场缺少 NAGA 链接`);
  const reportId = reportIdFromUrl(match.nagaUrl);
  const report = await readReport(reportId);
  const reportLogId = (report as { haihu_id?: unknown }).haihu_id;
  if (reportLogId !== match.tenhouLogId) {
    throw new Error(`第 ${match.matchNumber} 场报告牌谱 ID 不匹配：${String(reportLogId)}`);
  }
  const participantBySeat = new Map(match.seats.map((seat) => [seat.seat, seat.participantId]));
  const nagaRatings: NagaRating[] = calculateNagaRatings(report).map((rating) => ({
    participantId: participantBySeat.get(rating.seat) || "",
    model: rating.model,
    rating: rating.rating,
    agreementRate: rating.agreementRate,
    badMoveRate: rating.badMoveRate,
    decisionCount: rating.decisionCount,
  }));
  if (nagaRatings.length !== 8 || nagaRatings.some((rating) => !rating.participantId)) {
    throw new Error(`第 ${match.matchNumber} 场未解析出四家两模型的完整数据`);
  }
  return { matchNumber: match.matchNumber, reportId, nagaRatings };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>) {
  const results = Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

async function main() {
  const competition = JSON.parse(await fs.readFile(competitionFile, "utf8")) as Competition;
  const backfilled = await mapWithConcurrency(competition.matches, 4, backfillMatch);
  const byMatchNumber = new Map(backfilled.map((item) => [item.matchNumber, item]));
  for (const match of competition.matches) {
    const item = byMatchNumber.get(match.matchNumber);
    if (!item) throw new Error(`第 ${match.matchNumber} 场回填结果缺失`);
    match.nagaReportId = item.reportId;
    match.nagaRatings = item.nagaRatings;
  }

  await fs.mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.copyFile(competitionFile, path.join(backupDirectory, `1st-xrc-${timestamp}-before-naga-rating-backfill.json`));
  const temporary = `${competitionFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(competition, null, 2)}\n`, { flag: "wx" });
  await fs.rename(temporary, competitionFile);
  process.stdout.write(`已从 NAGA 报告回填 ${backfilled.length} 场，共 ${backfilled.length * 8} 条 Rating/一致率/恶手率数据。\n`);
}

await main();
