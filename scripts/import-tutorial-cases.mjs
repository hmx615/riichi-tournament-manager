import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceFile = process.env.TUTORIAL_SOURCE_FILE
  ? path.resolve(process.env.TUTORIAL_SOURCE_FILE)
  : path.resolve(root, "../立直麻将教程牌例/第一期_一向听/教程候选表.json");
const outputFile = path.join(root, "src/data/tutorial/one-shanten-candidates.json");
const reportDirectory = path.join(root, "data/naga-reports");

const aliases = {
  "5mr": "0m",
  "5pr": "0p",
  "5sr": "0s",
  E: "1z",
  S: "2z",
  W: "3z",
  N: "4z",
  P: "5z",
  F: "6z",
  C: "7z",
};

function normalizeTile(tile) {
  const normalized = aliases[tile] || tile;
  if (!/^(?:[0-9][mps]|[1-7]z)$/.test(normalized)) throw new Error(`未知牌码：${tile}`);
  return normalized;
}

function decisionBoard(report, candidate) {
  const turns = report.pred?.[candidate.roundIndex - 1];
  if (!Array.isArray(turns)) throw new Error(`${candidate.id} 找不到对应小局`);
  const rivers = Array.from({ length: 4 }, () => []);
  const melds = Array.from({ length: 4 }, () => []);
  const pendingRiichi = new Set();
  let riichiSeats = [false, false, false, false];
  let concealedTileCounts = [13, 13, 13, 13];
  let start = null;
  let scores = [];
  let kyotaku = 0;
  let leftTileCount = 0;
  for (let index = 0; index <= candidate.eventIndex; index += 1) {
    const msg = turns[index]?.info?.msg;
    if (!msg || typeof msg !== "object") continue;
    if (msg.type === "start_kyoku") {
      start = msg;
      scores = [...msg.scores];
      kyotaku = msg.kyotaku;
      leftTileCount = msg.left_hai_num;
      concealedTileCounts = msg.tehais.map((tiles) => tiles.length);
      riichiSeats = [false, false, false, false];
      continue;
    }
    if (typeof msg.left_hai_num === "number") leftTileCount = msg.left_hai_num;
    const actor = Number(msg.actor);
    if (msg.type === "reach") pendingRiichi.add(actor);
    if (msg.type === "reach_accepted") {
      if (Number.isInteger(actor) && actor >= 0 && actor < 4) riichiSeats[actor] = true;
      if (Array.isArray(msg.scores)) scores = [...msg.scores];
      kyotaku += 1;
    }
    if (msg.type === "tsumo") concealedTileCounts[actor] += 1;
    if (msg.type === "dahai") {
      concealedTileCounts[actor] -= 1;
      rivers[actor].push({
        tile: normalizeTile(msg.pai),
        called: false,
        riichi: pendingRiichi.delete(actor),
        tsumogiri: Boolean(msg.tsumogiri),
      });
    }
    if (["chi", "pon", "daiminkan"].includes(msg.type)) {
      const target = Number(msg.target);
      const consumed = msg.consumed.map(normalizeTile);
      concealedTileCounts[actor] -= consumed.length;
      const relativeTarget = (target - actor + 4) % 4;
      const calledIndex = relativeTarget === 3 ? 0 : relativeTarget === 2 ? 1 : consumed.length;
      const calledTile = normalizeTile(msg.pai);
      const tiles = [...consumed];
      tiles.splice(calledIndex, 0, calledTile);
      melds[actor].push({
        type: msg.type,
        tiles,
        calledIndex,
        addedTile: null,
      });
      const river = rivers[target];
      for (let riverIndex = river.length - 1; riverIndex >= 0; riverIndex -= 1) {
        if (!river[riverIndex].called && river[riverIndex].tile === normalizeTile(msg.pai)) {
          river[riverIndex].called = true;
          break;
        }
      }
    }
    if (msg.type === "ankan") {
      const tiles = msg.consumed.map(normalizeTile);
      concealedTileCounts[actor] -= tiles.length;
      melds[actor].push({ type: "ankan", tiles, calledIndex: null, addedTile: null });
    }
    if (msg.type === "kakan") {
      const addedTile = normalizeTile(msg.pai);
      concealedTileCounts[actor] -= 1;
      const meld = [...melds[actor]].reverse().find((item) => (
        item.type === "pon" && item.tiles.some((tile) => tile.replace(/^0([mps])$/, "5$1") === addedTile.replace(/^0([mps])$/, "5$1"))
      ));
      if (!meld) throw new Error(`${candidate.id} 找不到加杠前的碰`);
      meld.type = "kakan";
      meld.addedTile = addedTile;
    }
  }
  if (!start) throw new Error(`${candidate.id} 找不到开局信息`);
  const playerNames = report.player_info?.name;
  if (!Array.isArray(playerNames) || playerNames.length !== 4) throw new Error(`${candidate.id} 缺少四家玩家名`);
  return {
    scores: candidate.scores?.length === 4 ? candidate.scores : scores,
    dealerSeat: candidate.dealerSeat,
    roundWind: normalizeTile(start.bakaze),
    kyoku: start.kyoku,
    honba: start.honba,
    kyotaku,
    riichiSeats,
    leftTileCount,
    playerNames,
    rivers,
    concealedTileCounts,
    melds,
  };
}

function tableData(candidate, report) {
  const decisionMessage = report.pred?.[candidate.roundIndex - 1]?.[candidate.eventIndex]?.info?.msg;
  if (decisionMessage?.type !== "tsumo" || Number(decisionMessage.actor) !== candidate.actorSeat) {
    throw new Error(`${candidate.id} 找不到决策前摸牌`);
  }
  return {
    id: candidate.id,
    matchNumber: candidate.matchNumber,
    roundIndex: candidate.roundIndex,
    roundLabel: candidate.roundLabel,
    eventIndex: candidate.eventIndex,
    seatCode: candidate.seatCode,
    seatWind: candidate.seatWind,
    turnNumber: candidate.turnNumber,
    playerName: candidate.playerName,
    participant: candidate.participant.displayName,
    shantenTransition: candidate.lesson.shantenTransition,
    preDrawUkeire: candidate.lesson.preDrawUkeire,
    bestUkeire: candidate.lesson.bestUkeire,
    ukeireImprovement: candidate.lesson.ukeireImprovement,
    hand: candidate.handBefore.map(normalizeTile),
    drawnTile: normalizeTile(decisionMessage.pai),
    actualDiscard: normalizeTile(candidate.actualDiscard),
    actualRelation: candidate.actualRelation,
    modelChoices: candidate.models.map((model, index) => ({
      model: model.model,
      discard: normalizeTile(model.recommendation),
      probability: model.bestProbability,
      effectiveTileCount: candidate.lesson.modelOptions[index].effectiveTileCount,
      effectiveTileTypes: candidate.lesson.modelOptions[index].effectiveTileTypes,
      recommendations: (model.recommendations || [{
        discard: model.recommendation,
        probability: model.bestProbability,
      }]).map((recommendation) => {
        const option = candidate.optionAnalyses.find((item) => (
          normalizeTile(item.discard) === normalizeTile(recommendation.discard)
        ));
        return {
          discard: normalizeTile(recommendation.discard),
          probability: recommendation.probability,
          effectiveTileCount: option?.effectiveTileCount ?? 0,
          effectiveTileTypes: option?.effectiveTileTypes ?? 0,
        };
      }),
    })),
    tags: candidate.lesson.tags,
    lessonScore: candidate.lesson.score,
    efficientDiscardCount: candidate.lesson.efficientDiscardCount,
    ukeireSpread: candidate.lesson.ukeireSpread,
    doraMarkers: candidate.doraMarkers.map(normalizeTile),
    actorSeat: candidate.actorSeat,
    nagaReportId: candidate.nagaReportId,
    tenhouLogId: candidate.tenhouLogId,
    board: decisionBoard(report, candidate),
  };
}

const sourceCandidates = JSON.parse(await fs.readFile(sourceFile, "utf8"));
const reports = new Map();
const candidates = [];
for (const candidate of sourceCandidates) {
  if (!reports.has(candidate.nagaReportId)) {
    const reportFile = path.join(reportDirectory, `${candidate.nagaReportId}.json`);
    reports.set(candidate.nagaReportId, JSON.parse(await fs.readFile(reportFile, "utf8")));
  }
  candidates.push(tableData(candidate, reports.get(candidate.nagaReportId)));
}
if (!candidates.length || new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
  throw new Error("教程候选数据为空或编号重复");
}
for (const candidate of candidates) {
  if (!candidate.hand.includes(candidate.drawnTile)) {
    throw new Error(`${candidate.id} 的手牌中找不到本巡摸牌 ${candidate.drawnTile}`);
  }
  for (let seat = 0; seat < 4; seat += 1) {
    const equivalentTileCount = candidate.board.concealedTileCounts[seat] + candidate.board.melds[seat].length * 3;
    const expected = seat === candidate.actorSeat ? 14 : 13;
    if (equivalentTileCount !== expected) {
      throw new Error(`${candidate.id} 第 ${seat} 家等价手牌数应为 ${expected}，实际为 ${equivalentTileCount}`);
    }
  }
}
await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(candidates)}\n`);
console.log(`已导入 ${candidates.length} 条牌例到 ${path.relative(root, outputFile)}`);
