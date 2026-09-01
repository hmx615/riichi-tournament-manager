import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { Competition, MatchRecord, NagaRating } from "@/domain/types";
import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";
import { dataDirectory } from "@/server/data-directory";

const competitionDirectory = path.join(dataDirectory, "competitions");
const competitionBackupDirectory = path.join(dataDirectory, "backups", "competitions");

function validateCompetitionId(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("比赛 ID 格式无效");
}

function competitionFile(id: string) {
  validateCompetitionId(id);
  return path.join(competitionDirectory, `${id}.json`);
}

function parseCompetition(document: string) {
  return JSON.parse(document) as Competition;
}

async function readD1Competition(id: string) {
  validateCompetitionId(id);
  const db = await tournamentDatabase();
  const row = await db.prepare("SELECT document, version FROM competitions WHERE id = ?")
    .bind(id)
    .first<{ document: string; version: number }>();
  return row ? { competition: parseCompetition(row.document), version: row.version } : null;
}

async function replaceD1Competition(competition: Competition, reason?: string) {
  const current = await readD1Competition(competition.id);
  if (!current) throw new Error("比赛不存在");
  const db = await tournamentDatabase();
  const now = new Date().toISOString();
  const statements = [];
  if (reason) {
    statements.push(db.prepare(
      "INSERT INTO competition_backups (id, competition_id, reason, document, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), competition.id, reason, JSON.stringify(current.competition), now));
  }
  statements.push(db.prepare(
    "UPDATE competitions SET document = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  ).bind(JSON.stringify(competition), now, competition.id, current.version));
  const results = await db.batch(statements);
  const update = results[results.length - 1];
  if (!update.success || update.meta.changes !== 1) throw new Error("比赛数据已被其他操作更新，请刷新后重试");
}

async function replaceFileCompetition(competition: Competition) {
  const target = competitionFile(competition.id);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(competition, null, 2)}\n`, { flag: "wx" });
  try {
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function replaceCompetition(competition: Competition, reason?: string) {
  if (usesD1Storage()) return replaceD1Competition(competition, reason);
  if (reason) {
    const current = await getCompetition(competition.id);
    if (!current) throw new Error("比赛不存在");
    await fs.mkdir(competitionBackupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(competitionBackupDirectory, `${competition.id}-${timestamp}-${reason}.json`);
    await fs.writeFile(backupFile, `${JSON.stringify(current, null, 2)}\n`, { flag: "wx" });
  }
  return replaceFileCompetition(competition);
}

export async function listCompetitions(): Promise<Competition[]> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare("SELECT document FROM competitions ORDER BY created_at, id")
      .all<{ document: string }>();
    return result.results.map((row) => parseCompetition(row.document));
  }
  await fs.mkdir(competitionDirectory, { recursive: true });
  const files = (await fs.readdir(competitionDirectory)).filter((file) => file.endsWith(".json"));
  return Promise.all(files.map(async (file) => parseCompetition(await fs.readFile(path.join(competitionDirectory, file), "utf8"))));
}

export async function getCompetition(id: string): Promise<Competition | null> {
  if (usesD1Storage()) return (await readD1Competition(id))?.competition ?? null;
  try {
    return parseCompetition(await fs.readFile(competitionFile(id), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function createCompetition(competition: Competition): Promise<void> {
  validateCompetitionId(competition.id);
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const now = new Date().toISOString();
    try {
      await db.prepare(
        "INSERT INTO competitions (id, document, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      ).bind(competition.id, JSON.stringify(competition), now, now).run();
      return;
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new Error("比赛代号已存在");
      throw error;
    }
  }
  await fs.mkdir(competitionDirectory, { recursive: true });
  const target = competitionFile(competition.id);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(competition, null, 2)}\n`, { flag: "wx" });
    await fs.link(temporary, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("比赛代号已存在");
    throw error;
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function updateCompetition(competition: Competition): Promise<void> {
  await replaceCompetition(competition, "before-settings-update");
}

export async function appendMatch(competitionId: string, match: MatchRecord): Promise<void> {
  const competition = await getCompetition(competitionId);
  if (!competition) throw new Error("比赛不存在");
  if (competition.matches.some((item) => item.tenhouLogId === match.tenhouLogId)) throw new Error("该牌谱已经录入本比赛");
  if (competition.matches.some((item) => item.matchNumber === match.matchNumber)) throw new Error("场次编号已经存在");
  competition.matches.push(match);
  competition.matches.sort((a, b) => a.matchNumber - b.matchNumber);
  if (competition.status === "draft") competition.status = "active";
  await replaceCompetition(competition);
}

export async function supplementMatchNagaAnalysis(
  competitionId: string,
  tenhouLogId: string,
  nagaUrl: string,
  nagaReportId: string,
  nagaRatings: NagaRating[],
): Promise<void> {
  const competition = await getCompetition(competitionId);
  if (!competition) throw new Error("比赛不存在");
  const match = competition.matches.find((item) => item.tenhouLogId === tenhouLogId);
  if (!match) throw new Error("找不到对应的已录入对局");
  match.nagaUrl = nagaUrl;
  match.nagaReportId = nagaReportId;
  const incomingKeys = new Set(nagaRatings.map((rating) => `${rating.participantId}\u0000${rating.model}`));
  match.nagaRatings = [
    ...(match.nagaRatings || []).filter((rating) => !incomingKeys.has(`${rating.participantId}\u0000${rating.model}`)),
    ...nagaRatings,
  ];
  await replaceCompetition(competition);
}

export async function deleteMatch(competitionId: string, matchNumber: number): Promise<void> {
  const competition = await getCompetition(competitionId);
  if (!competition) throw new Error("比赛不存在");
  if (!competition.matches.some((item) => item.matchNumber === matchNumber)) throw new Error("对局不存在或已经删除");
  competition.matches = competition.matches.filter((item) => item.matchNumber !== matchNumber);
  await replaceCompetition(competition, `before-delete-match-${matchNumber}`);
}
