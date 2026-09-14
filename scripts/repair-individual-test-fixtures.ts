import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import type { Competition } from "../src/domain/types";
import { generateIndividualSchedule } from "../src/domain/individual-schedule";
import { completeScheduledMatch } from "../src/domain/scheduled-match";
import { normalizeMajsoulJson } from "../src/domain/majsoul-json";
import { matchContentFingerprint, finalRawPointsFromHands } from "../src/domain/tenhou-log-normalizer";
import { calculateCompetitionPoints } from "../src/domain/scoring";

const root = path.resolve("data");
const file = path.join(root, "competitions/1st-cccp213e.json");
const original = await fs.readFile(file, "utf8");
const competition: Competition = JSON.parse(original);
assert.equal(competition.matches.length, 1, "Only repair the test cup with its single recorded match");
const schedule = generateIndividualSchedule(competition.participants.map((p) => p.id), "preliminary", 4);
assert.equal(schedule.length, competition.individualSchedule?.length);
competition.individualSchedule = schedule.map((table, index) => ({
  ...competition.individualSchedule![index], ...table,
}));
const first = competition.matches[0];
assert.deepEqual([...first.seats.map((s) => s.participantId)].sort(), [...schedule[0].participantIds].sort());
competition.matches = [];
competition.individualSchedule[0].status = "scheduled";
first.scheduleId = competition.individualSchedule[0].id;
completeScheduledMatch(competition, first);
competition.matches = [first];

const output = path.join(root, "logs/individual-test-preliminary");
const fixtures: { filename: string; text: string }[] = [];
// Preserve the exact first game already imported by the user.
const recorded = JSON.parse(await fs.readFile(path.join(root, "logs", first.tenhouLogId + ".json"), "utf8"));
const fingerprints = new Set([await matchContentFingerprint(recorded.log)]);
const rows = ["# 初赛测试牌谱", "", "第 1 场已保留，继续从第 2 场录入。以下文件仅用于虚拟测试。", "", "| 文件 | 轮次 / 桌次 | 选手 |", "| --- | --- | --- |"];
for (const [index, table] of competition.individualSchedule.entries()) {
  const filename = `preliminary-${String(index + 1).padStart(2, "0")}.json`;
  const names = table.participantIds.map((id) => competition.participants.find((p) => p.id === id)!.displayName);
  let fixture = recorded;
  if (index > 0) {
    const points = [25000, 25000, 25000, 25000];
    const hands: unknown[][] = [];
    for (let round = 0; round < 8; round++) {
      const winner = (round * round + index) % 4;
      const loser = (winner + 1 + index % 3) % 4;
      const payment = winner === round % 4 ? 2000 : 1300;
      const deltas = [0, 0, 0, 0];
      deltas[winner] = payment; deltas[loser] = -payment;
      const hand: unknown[] = [[round, 0, 0], [...points], [41 + index % 7], []];
      for (let seat = 0; seat < 4; seat++) {
        const tiles = seat === winner ? [11, 12, 13, 21, 22, 23, 31, 32, 33, 45, 45, 45, 46] : [14, 15, 16, 24, 25, 26, 34, 35, 36, 41, 42, 43, 47];
        hand.push(tiles, seat === loser ? [46] : [], seat === loser ? [60] : []);
      }
      hand.push(["和了", deltas, [winner, loser, winner, `40符1飜${payment}点`, "役牌 白(1飜)"]]);
      hands.push(hand);
      deltas.forEach((delta, seat) => { points[seat] += delta; });
    }
    fixture = { name: names, sc: points.flatMap((p, seat) => [p, calculateCompetitionPoints(points, competition.initialPoints, competition.rankPoints)[seat]]),
      log: hands, title: ["虚拟初赛测试", table.scheduledAt], sourcePlatform: "majsoul" };
    assert.deepEqual(finalRawPointsFromHands(hands, "测试"), points);
    const fingerprint = await matchContentFingerprint(hands);
    assert(!fingerprints.has(fingerprint), "Each fixture must describe a distinct game");
    fingerprints.add(fingerprint);
  }
  const text = JSON.stringify(fixture, null, 2) + "\n";
  const normalized = await normalizeMajsoulJson(text);
  assert.deepEqual(normalized.name, names);
  fixtures.push({ filename, text });
  rows.push(`| ${filename} | 第 ${table.round} 轮 / A${table.tableNumber} | ${names.join("、")} |`);
}
const backup = path.join(root, "backups", "individual-test-repair-" + Date.now());
await fs.mkdir(backup, { recursive: true });
await fs.writeFile(path.join(backup, "competition.json"), original, { flag: "wx" });
await fs.cp(output, path.join(backup, "fixtures"), { recursive: true });
await fs.writeFile(file, JSON.stringify(competition, null, 2) + "\n");
for (const fixture of fixtures) await fs.writeFile(path.join(output, fixture.filename), fixture.text);
await fs.writeFile(path.join(output, "README.md"), rows.join("\n") + "\n");
console.log(JSON.stringify({ backup, games: fixtures.length, uniqueFingerprints: fingerprints.size, schedule }, null, 2));
