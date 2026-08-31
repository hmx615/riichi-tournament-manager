#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE = path.join(ROOT, "reference", "1st-xrc-29");
const OUTPUT = path.join(ROOT, "src", "data", "1st-xrc.seed.json");
const COMPETITION_OUTPUT = path.join(ROOT, "data", "competitions", "1st-xrc.json");
const PLAYER_KINDS = { hmx: "human", xiaop: "human", NAGA: "ai", Mortal: "ai" };
const RANK_POINTS = [30, 10, -10, -30];

function readLegacyDashboard() {
  const html = fs.readFileSync(path.join(REFERENCE, "1st_XRC_四人数据对比.html"), "utf8");
  const match = html.match(/const DATA = (\{[\s\S]*?\});\n/);
  if (!match) throw new Error("无法从固定版网页读取 DATA");
  return JSON.parse(match[1]);
}

function ranks(rawPoints) {
  const order = [0, 1, 2, 3].sort((a, b) => rawPoints[b] - rawPoints[a] || a - b);
  const result = Array(4);
  order.forEach((seat, index) => { result[seat] = index + 1; });
  return result;
}

function competitionPoints(rawPoints) {
  const rankBySeat = ranks(rawPoints);
  return rawPoints.map((points, seat) =>
    Number((((points - 25000) / 1000) + RANK_POINTS[rankBySeat[seat] - 1]).toFixed(1)),
  );
}

function playedAt(logId) {
  const match = logId.match(/^(\d{4})(\d{2})(\d{2})(\d{2})/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:00:00+08:00`;
}

const legacy = readLegacyDashboard();
const usernames = Object.fromEntries(legacy.identities.map((id) => [id, new Set()]));
const matches = legacy.matches.map((entry) => {
  const log = JSON.parse(fs.readFileSync(path.join(REFERENCE, "cache", `${entry.logId}.json`), "utf8"));
  const rawPoints = [log.sc[0], log.sc[2], log.sc[4], log.sc[6]].map(Number);
  const rankBySeat = ranks(rawPoints);
  const pointsBySeat = competitionPoints(rawPoints);
  const seats = entry.seats.map((participantId, seat) => {
    const sourceUsername = String(log.name[seat]);
    usernames[participantId].add(sourceUsername);
    return {
      seat,
      participantId,
      sourceUsername,
      rawPoints: rawPoints[seat],
      rank: rankBySeat[seat],
      competitionPoints: pointsBySeat[seat],
      assignmentSource: "legacy_import",
    };
  });
  return {
    id: `1st-xrc-${String(entry.matchNumber).padStart(3, "0")}`,
    matchNumber: entry.matchNumber,
    status: "completed",
    playedAt: playedAt(entry.logId),
    tenhouLogId: entry.logId,
    tenhouUrl: `https://tenhou.net/3/?log=${entry.logId}`,
    nagaUrl: entry.sourceType === "NAGA" ? entry.url : null,
    seats,
    reviewNote: null,
  };
});

const seed = {
  schemaVersion: 1,
  importedAt: new Date().toISOString(),
  competition: {
    id: "1st-xrc",
    name: "1st XRC 人机大战",
    code: "1ST-XRC",
    status: "active",
    plannedMatchCount: 50,
    initialPoints: 25000,
    rankPoints: RANK_POINTS,
    participants: legacy.identities.map((id) => ({
      id,
      displayName: id,
      kind: PLAYER_KINDS[id],
      color: legacy.colors[id],
      usernames: [...usernames[id]].sort((a, b) => a.localeCompare(b, "zh-CN")),
    })),
    matches,
  },
  legacySummary: {
    scoreGameCount: legacy.scoreGameCount,
    dataGameCount: legacy.dataGameCount,
    handCount: legacy.handCount,
    colors: legacy.colors,
    players: legacy.players,
    ratings: legacy.ratings,
  },
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`);
fs.mkdirSync(path.dirname(COMPETITION_OUTPUT), { recursive: true });
fs.writeFileSync(COMPETITION_OUTPUT, `${JSON.stringify(seed.competition, null, 2)}\n`);
process.stdout.write(`已导入 ${matches.length} 场，输出 ${OUTPUT}\n`);
