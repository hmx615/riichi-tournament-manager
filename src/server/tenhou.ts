import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Competition } from "@/domain/types";
import { calculateNagaRatings, type SeatNagaRating } from "@/domain/naga-rating";
import { normalizeNagaCustomLog } from "@/domain/naga-custom-log";
import { calculateCompetitionPoints, ranksFromRawPoints } from "@/domain/scoring";
import { dataDirectory } from "@/server/data-directory";

export type TenhouLog = {
  ref: string;
  name: string[];
  sc: number[];
  log: unknown[][];
};

export type MatchPreview = {
  sourceUrl: string;
  sourceType: "tenhou" | "naga";
  logId: string;
  tenhouUrl: string;
  nagaUrl: string | null;
  nagaReportId: string | null;
  nagaRatings: SeatNagaRating[];
  playedAt: string;
  seats: Array<{
    seat: 0 | 1 | 2 | 3;
    sourceUsername: string;
    rawPoints: number;
    rank: 1 | 2 | 3 | 4;
    competitionPoints: number;
    participantId: string | null;
  }>;
};

const logCacheDirectory = path.join(dataDirectory, "logs");
const nagaReportCacheDirectory = path.join(dataDirectory, "naga-reports");
const legacyCacheDirectory = path.join(process.cwd(), "reference", "1st-xrc-29", "cache");
const execFileAsync = promisify(execFile);

async function curlJson(url: string) {
  try {
    const { stdout } = await execFileAsync("curl", [
      "--compressed", "-L", "-sS", "--fail", "--max-time", "30",
      "-A", "Mozilla/5.0 XRC-Tournament-Manager", url,
    ], { encoding: "utf8", maxBuffer: 100 << 20 });
    return JSON.parse(stdout) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`无法连接数据源：${detail}`);
  }
}

async function fetchJson(url: string) {
  if (new URL(url).hostname.endsWith("tenhou.net")) return curlJson(url);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      headers: { "User-Agent": "Mozilla/5.0 XRC-Tournament-Manager" },
    });
    if (!response.ok) throw new Error(`数据源返回 ${response.status}`);
    return response.json() as Promise<unknown>;
  } catch {
    return curlJson(url);
  }
}

function validateLog(value: unknown, expectedLogId: string): TenhouLog {
  if (!value || typeof value !== "object") throw new Error("天凤牌谱格式无效");
  const log = value as Partial<TenhouLog>;
  if (!Array.isArray(log.name) || log.name.length !== 4 || !log.name.every((name) => typeof name === "string")) throw new Error("牌谱缺少四家昵称");
  if (!Array.isArray(log.sc) || log.sc.length < 8 || !log.sc.every((score) => Number.isFinite(Number(score)))) throw new Error("牌谱缺少终局分数");
  if (!Array.isArray(log.log)) throw new Error("牌谱缺少小局数据");
  return { ref: typeof log.ref === "string" ? log.ref : expectedLogId, name: log.name, sc: log.sc.map(Number), log: log.log };
}

export async function readCachedLog(logId: string): Promise<TenhouLog | null> {
  for (const directory of [logCacheDirectory, legacyCacheDirectory]) {
    try {
      const value = JSON.parse(await fs.readFile(path.join(directory, `${logId}.json`), "utf8"));
      return validateLog(value, logId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function fetchTenhouLog(logId: string) {
  const cached = await readCachedLog(logId);
  if (cached) return cached;
  const value = await fetchJson(`https://tenhou.net/5/mjlog2json.cgi?${encodeURIComponent(logId)}`);
  const log = validateLog(value, logId);
  await fs.mkdir(logCacheDirectory, { recursive: true });
  await fs.writeFile(path.join(logCacheDirectory, `${logId}.json`), `${JSON.stringify(log)}\n`);
  return log;
}

async function cacheLog(log: TenhouLog) {
  await fs.mkdir(logCacheDirectory, { recursive: true });
  await fs.writeFile(path.join(logCacheDirectory, `${log.ref}.json`), `${JSON.stringify(log)}\n`);
}

function logIdFromTenhouUrl(url: URL) {
  if (!/(^|\.)tenhou\.net$/i.test(url.hostname)) return null;
  return url.searchParams.get("log");
}

async function readNagaReport(reportId: string) {
  const cacheFile = path.join(nagaReportCacheDirectory, `${reportId}.json`);
  try {
    return JSON.parse(await fs.readFile(cacheFile, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const report = await fetchJson(`https://ricochet.cn/api/naga/proxy/reports/${encodeURIComponent(reportId)}.json.gz`);
  await fs.mkdir(nagaReportCacheDirectory, { recursive: true });
  await fs.writeFile(cacheFile, `${JSON.stringify(report)}\n`);
  return report;
}

async function parseNagaUrl(url: URL) {
  const reportId = url.searchParams.get("report_id");
  if (!reportId) return null;
  if (!/(^|\.)(ricochet\.cn|dmv\.nico)$/i.test(url.hostname)) return null;
  if (!/^[a-z0-9_-]+$/i.test(reportId)) throw new Error("NAGA 报告 ID 格式无效");
  const report = await readNagaReport(reportId);
  const logId = (report as { haihu_id?: unknown }).haihu_id;
  const ratings = calculateNagaRatings(report);
  if (typeof logId === "string" && logId.length > 0) return { logId, reportId, ratings, log: null };
  const log = normalizeNagaCustomLog(report);
  await cacheLog(log);
  return { logId: log.ref, reportId, ratings, log };
}

function playedAtFromLogId(logId: string) {
  const match = logId.match(/^(\d{4})(\d{2})(\d{2})(\d{2})/);
  if (!match) return new Date().toISOString();
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:00:00+08:00`;
}

function inferParticipantId(competition: Competition, username: string) {
  const exact = competition.participants.filter((participant) => participant.usernames.includes(username));
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  const naga = competition.participants.filter((participant) => participant.id.toLowerCase() === "naga" && /naga/i.test(username));
  if (naga.length === 1) return naga[0].id;
  const mortal = competition.participants.filter((participant) => participant.id.toLowerCase() === "mortal" && username === "NoName");
  return mortal.length === 1 ? mortal[0].id : null;
}

export async function parseMatchSource(sourceUrl: string, competition: Competition): Promise<MatchPreview> {
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new Error("链接格式无效"); }
  const tenhouLogId = logIdFromTenhouUrl(url);
  const nagaSource = tenhouLogId ? null : await parseNagaUrl(url);
  const logId = tenhouLogId || nagaSource?.logId;
  if (!logId) throw new Error("无法识别天凤或 NAGA 链接");
  const isTenhouLog = /^\d{10}gm-[0-9a-f]+-\d+-[0-9a-f]+$/i.test(logId);
  if (tenhouLogId && !isTenhouLog) throw new Error("天凤牌谱 ID 格式无效");
  const log = nagaSource?.log || await fetchTenhouLog(logId);
  const rawPoints = [log.sc[0], log.sc[2], log.sc[4], log.sc[6]].map(Number);
  const ranks = ranksFromRawPoints(rawPoints);
  const points = calculateCompetitionPoints(rawPoints, competition.initialPoints, competition.rankPoints);
  return {
    sourceUrl,
    sourceType: tenhouLogId ? "tenhou" : "naga",
    logId,
    tenhouUrl: isTenhouLog ? `https://tenhou.net/3/?log=${logId}` : "",
    nagaUrl: tenhouLogId ? null : sourceUrl,
    nagaReportId: nagaSource?.reportId || null,
    nagaRatings: nagaSource?.ratings || [],
    playedAt: isTenhouLog ? playedAtFromLogId(logId) : new Date().toISOString(),
    seats: log.name.map((sourceUsername, seat) => ({
      seat: seat as 0 | 1 | 2 | 3,
      sourceUsername,
      rawPoints: rawPoints[seat],
      rank: ranks[seat],
      competitionPoints: points[seat],
      participantId: inferParticipantId(competition, sourceUsername),
    })),
  };
}
