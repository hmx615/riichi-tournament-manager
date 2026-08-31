import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { Competition, MatchRecord, NagaRating } from "@/domain/types";
import { dataDirectory } from "@/server/data-directory";

const competitionDirectory = path.join(dataDirectory, "competitions");
const competitionBackupDirectory = path.join(dataDirectory, "backups", "competitions");

function competitionFile(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("比赛 ID 格式无效");
  return path.join(competitionDirectory, `${id}.json`);
}

export async function listCompetitions(): Promise<Competition[]> {
  await fs.mkdir(competitionDirectory, { recursive: true });
  const files = (await fs.readdir(competitionDirectory)).filter((file) => file.endsWith(".json"));
  return Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(path.join(competitionDirectory, file), "utf8")) as Competition));
}

export async function getCompetition(id: string): Promise<Competition | null> {
  try {
    return JSON.parse(await fs.readFile(competitionFile(id), "utf8")) as Competition;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function createCompetition(competition: Competition): Promise<void> {
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

async function replaceCompetition(competition: Competition) {
  const target = competitionFile(competition.id);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(competition, null, 2)}\n`, { flag: "wx" });
  try {
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function updateCompetition(competition: Competition): Promise<void> {
  const current = await getCompetition(competition.id);
  if (!current) throw new Error("比赛不存在");
  await fs.mkdir(competitionBackupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(competitionBackupDirectory, `${competition.id}-${timestamp}-before-settings-update.json`);
  await fs.writeFile(backupFile, `${JSON.stringify(current, null, 2)}\n`, { flag: "wx" });
  await replaceCompetition(competition);
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
  await fs.mkdir(competitionBackupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(competitionBackupDirectory, `${competition.id}-${timestamp}-before-delete-match-${matchNumber}.json`);
  await fs.writeFile(backupFile, `${JSON.stringify(competition, null, 2)}\n`, { flag: "wx" });
  competition.matches = competition.matches.filter((item) => item.matchNumber !== matchNumber);
  await replaceCompetition(competition);
}
