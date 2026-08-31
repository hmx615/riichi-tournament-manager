#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SOURCE_DIR = "/home/XXH-07652/Desktop/个人文档/麻将/xxc";
const LINKS_FILE = path.join(SOURCE_DIR, "牌谱目录.txt");
const XLSX_FILE = path.join(SOURCE_DIR, "1st MRC.xlsx");
const OUTPUT_DIR = __dirname;
const CACHE_DIR = path.join(OUTPUT_DIR, "cache");

const IDENTITIES = ["hmx", "xiaop", "NAGA", "Mortal"];
const EXCEL_ROWS = { hmx: 4, xiaop: 5, NAGA: 6, Mortal: 7 };
const TERMINALS = new Set([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);
const CONFIRMED_OVERRIDES = {
  // Excel match 25 contains incorrect scores; the user confirmed this exact paipu.
  "2026082417gm-0009-1940-bddca1e2": {
    matchNumber: 25,
    seatIdentities: ["xiaop", "NAGA", "Mortal", "hmx"],
    correction: "第25局 Excel 整列分数错误，以指定牌谱为准",
  },
  // Excel match 26 has the NAGA and Mortal scores reversed.
  "2026082417gm-0009-1940-308f2e9f": {
    matchNumber: 26,
    seatIdentities: ["Mortal", "NAGA", "hmx", "xiaop"],
    correction: "第26局 Excel 的 NAGA/Mortal 分数写反",
  },
};

function xmlDecode(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function columnNumber(ref) {
  const letters = ref.match(/[A-Z]+/)[0];
  let result = 0;
  for (const ch of letters) result = result * 26 + ch.charCodeAt(0) - 64;
  return result;
}

function readZipEntry(file, entry) {
  try {
    return execFileSync("unzip", ["-p", file, entry], { encoding: "utf8", maxBuffer: 20 << 20 });
  } catch (error) {
    if (error.status === 0 && error.stdout) return String(error.stdout);
    throw error;
  }
}

function parseSheet(xml, sharedStrings) {
  const rows = new Map();
  for (const rowMatch of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = new Map();
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const type = (attrs.match(/t="([^"]+)"/) || [])[1];
      const raw = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const inline = (body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
      let value = raw ?? "";
      if (type === "s") value = sharedStrings[Number(raw)] ?? "";
      if (type === "inlineStr") value = xmlDecode(inline || "");
      if (type !== "s" && type !== "inlineStr" && value !== "" && Number.isFinite(Number(value))) {
        value = Number(value);
      }
      row.set(columnNumber(ref), value);
    }
    rows.set(Number(rowMatch[1]), row);
  }
  return rows;
}

function readExcelScores() {
  const sharedXml = readZipEntry(XLSX_FILE, "xl/sharedStrings.xml");
  const strings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    xmlDecode([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join("")),
  );
  const rows = parseSheet(readZipEntry(XLSX_FILE, "xl/worksheets/sheet2.xml"), strings);
  const matches = [];
  for (let matchNumber = 1; matchNumber <= 29; matchNumber += 1) {
    const column = 6 + matchNumber; // G is match 1.
    const scores = {};
    for (const identity of IDENTITIES) scores[identity] = Number(rows.get(EXCEL_ROWS[identity]).get(column));
    matches.push({ matchNumber, scores });
  }
  return matches;
}

function readLogIds() {
  const text = fs.readFileSync(LINKS_FILE, "utf8");
  const aiSection = text.split(/下面为AI大战[^\n]*/)[1] || "";
  return [...aiSection.matchAll(/log=([0-9]{10}gm-[0-9a-f]+-[0-9]+-[0-9a-f]+)/g)].map((match) => match[1]);
}

function fetchLog(logId) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${logId}.json`);
  if (!fs.existsSync(cacheFile)) {
    const url = `https://tenhou.net/5/mjlog2json.cgi?${logId}`;
    let body;
    try {
      body = execFileSync("curl", ["-L", "-sS", "--max-time", "30", "-A", "Mozilla/5.0", url], {
        encoding: "utf8",
        maxBuffer: 20 << 20,
      });
    } catch (error) {
      if (error.status === 0 && error.stdout) body = String(error.stdout);
      else throw error;
    }
    const parsed = JSON.parse(body);
    fs.writeFileSync(cacheFile, `${JSON.stringify(parsed)}\n`);
  }
  return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.011;
}

function permutations(values) {
  if (values.length <= 1) return [values];
  const result = [];
  for (let i = 0; i < values.length; i += 1) {
    const rest = values.slice(0, i).concat(values.slice(i + 1));
    for (const suffix of permutations(rest)) result.push([values[i], ...suffix]);
  }
  return result;
}

function competitionScores(log) {
  const rawScores = [log.sc[0], log.sc[2], log.sc[4], log.sc[6]].map(Number);
  const rankOrder = [...Array(4).keys()].sort((a, b) => rawScores[b] - rawScores[a] || a - b);
  const rankBySeat = Array(4);
  rankOrder.forEach((seat, rank) => { rankBySeat[seat] = rank; });
  const rankPoints = [30, 10, -10, -30];
  return rawScores.map((score, seat) => (score - 25000) / 1000 + rankPoints[rankBySeat[seat]]);
}

function matchLogToExcel(log, excelMatches) {
  const override = CONFIRMED_OVERRIDES[log.ref];
  if (override) {
    return {
      excelMatch: excelMatches.find((item) => item.matchNumber === override.matchNumber),
      seatIdentities: override.seatIdentities,
      correction: override.correction,
    };
  }
  const seatScores = competitionScores(log);
  const candidates = [];
  const scoreCandidates = [];
  for (const excelMatch of excelMatches) {
    for (const seatIdentities of permutations(IDENTITIES)) {
      const scoresMatch = seatIdentities.every((identity, seat) => nearlyEqual(excelMatch.scores[identity], seatScores[seat]));
      if (scoresMatch) scoreCandidates.push({ excelMatch, seatIdentities });
      const aliasesMatch = seatIdentities.every((identity, seat) => {
        const name = String(log.name[seat] || "");
        if (/NAGA/i.test(name)) return identity === "NAGA";
        if (name === "NoName") return identity === "Mortal";
        return identity === "hmx" || identity === "xiaop";
      });
      if (aliasesMatch && scoresMatch) {
        candidates.push({ excelMatch, seatIdentities });
      }
    }
  }
  if (candidates.length === 1) return candidates[0];

  const matchNumbers = [...new Set(scoreCandidates.map((item) => item.excelMatch.matchNumber))];
  const nagaSeats = log.name.map((name, seat) => (/NAGA/i.test(String(name)) ? seat : -1)).filter((seat) => seat >= 0);
  const mortalSeats = log.name.map((name, seat) => (name === "NoName" ? seat : -1)).filter((seat) => seat >= 0);
  if (matchNumbers.length === 1 && nagaSeats.length === 1 && mortalSeats.length === 1) {
    const base = scoreCandidates[0];
    const seatIdentities = base.seatIdentities.slice();
    const nagaSeat = nagaSeats[0];
    const mortalSeat = mortalSeats[0];
    const nagaAssignedSeat = seatIdentities.indexOf("NAGA");
    const mortalAssignedSeat = seatIdentities.indexOf("Mortal");
    if (nagaAssignedSeat === mortalSeat && mortalAssignedSeat === nagaSeat) {
      seatIdentities[nagaSeat] = "NAGA";
      seatIdentities[mortalSeat] = "Mortal";
      return {
        excelMatch: base.excelMatch,
        seatIdentities,
        correction: `第${base.excelMatch.matchNumber}局 Excel 的 NAGA/Mortal 分数写反（由账号标签检出）`,
      };
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`牌谱 ${log.ref} 匹配到 ${candidates.length} 个别名一致候选、${scoreCandidates.length} 个分数候选`);
  }
  return candidates[0];
}

function tileIndex(code) {
  if (code === 51) code = 15;
  if (code === 52) code = 25;
  if (code === 53) code = 35;
  const suit = Math.floor(code / 10);
  const rank = code % 10;
  if (suit >= 1 && suit <= 3) return (suit - 1) * 9 + rank - 1;
  if (suit === 4 && rank >= 1 && rank <= 7) return 27 + rank - 1;
  return -1;
}

function shanten(counts) {
  let best = 8;
  function dfs(index, melds, pairs, taatsu) {
    while (index < 34 && counts[index] === 0) index += 1;
    if (index >= 34) {
      const usableTaatsu = Math.min(taatsu, 4 - melds);
      best = Math.min(best, 8 - melds * 2 - usableTaatsu - Math.min(pairs, 1));
      return;
    }
    if (melds > 4 || taatsu > 4) return;
    const suited = index < 27;
    const rank = index % 9;

    counts[index] -= 1;
    dfs(index, melds, pairs, taatsu);
    counts[index] += 1;

    if (counts[index] >= 3) {
      counts[index] -= 3;
      dfs(index, melds + 1, pairs, taatsu);
      counts[index] += 3;
    }
    if (suited && rank <= 6 && counts[index + 1] && counts[index + 2]) {
      counts[index] -= 1;
      counts[index + 1] -= 1;
      counts[index + 2] -= 1;
      dfs(index, melds + 1, pairs, taatsu);
      counts[index] += 1;
      counts[index + 1] += 1;
      counts[index + 2] += 1;
    }
    if (counts[index] >= 2) {
      counts[index] -= 2;
      dfs(index, melds, pairs + 1, taatsu);
      dfs(index, melds, pairs, taatsu + 1);
      counts[index] += 2;
    }
    if (suited && rank <= 7 && counts[index + 1]) {
      counts[index] -= 1;
      counts[index + 1] -= 1;
      dfs(index, melds, pairs, taatsu + 1);
      counts[index] += 1;
      counts[index + 1] += 1;
    }
    if (suited && rank <= 6 && counts[index + 2]) {
      counts[index] -= 1;
      counts[index + 2] -= 1;
      dfs(index, melds, pairs, taatsu + 1);
      counts[index] += 1;
      counts[index + 2] += 1;
    }
  }
  dfs(0, 0, 0, 0);
  const distinct = counts.filter(Boolean).length;
  const pairCount = counts.filter((count) => count >= 2).length;
  const chiitoi = 6 - pairCount + Math.max(0, 7 - distinct);
  let uniqueTerminals = 0;
  let terminalPair = false;
  for (const index of TERMINALS) {
    if (counts[index]) uniqueTerminals += 1;
    if (counts[index] >= 2) terminalPair = true;
  }
  const kokushi = 13 - uniqueTerminals - (terminalPair ? 1 : 0);
  return Math.min(best, chiitoi, kokushi);
}

function initialShanten(tiles) {
  const counts = Array(34).fill(0);
  for (const tile of tiles) {
    const index = tileIndex(tile);
    if (index >= 0) counts[index] += 1;
  }
  return shanten(counts);
}

function callType(value) {
  if (typeof value !== "string") return null;
  if (value.startsWith("c")) return "chi";
  if (value.includes("p")) return "pon";
  if (value.includes("m")) return "daiminkan";
  if (value.includes("k")) return "kakan";
  if (value.includes("a")) return "ankan";
  return null;
}

function resultDetails(hand) {
  return hand.slice(16).filter((item) => Array.isArray(item));
}

function playerHandState(hand, seat) {
  const draws = hand[5 + seat * 3] || [];
  const discards = hand[6 + seat * 3] || [];
  const openCall = draws.some((value) => ["chi", "pon", "daiminkan", "kakan"].includes(callType(value)));
  const reachIndex = discards.findIndex((value) => typeof value === "string" && value.startsWith("r"));
  const riichi = reachIndex >= 0;
  return {
    openCall,
    riichi,
    reachIndex,
    discardCount: discards.length,
  };
}

function createStats() {
  return {
    games: 0,
    rankCounts: [0, 0, 0, 0],
    finalScoreByRank: [0, 0, 0, 0],
    negativeGames: 0,
    hands: 0,
    dealerHands: 0,
    childHands: 0,
    initialShantenSum: 0,
    dealerShantenSum: 0,
    childShantenSum: 0,
    wins: 0,
    tsumoWins: 0,
    damaWins: 0,
    riichiWins: 0,
    furoWins: 0,
    winPointSum: 0,
    winTurnSum: 0,
    dealInHands: 0,
    dealInEvents: 0,
    dealInPointSum: 0,
    dealInWhileRiichi: 0,
    dealInWhileFuro: 0,
    dealInToRiichi: 0,
    dealInToFuro: 0,
    dealInToDama: 0,
    furoHands: 0,
    riichiHands: 0,
    drawHands: 0,
    drawTenpaiHands: 0,
    drawWhileRiichi: 0,
    drawWhileFuro: 0,
    tsumoLossHands: 0,
    tsumoLossValueSum: 0,
    ippatsuWins: 0,
    uraWins: 0,
    yakumanWins: 0,
    maxFan: 0,
    doubleRiichi: 0,
    riichiTurnSum: 0,
    riichiNetSum: 0,
    riichiWinIncome: 0,
    riichiDealInCost: 0,
    firstRiichi: 0,
    chaseRiichi: 0,
    firstRiichiChased: 0,
    maxDealerRepeat: 0,
  };
}

function addGameStats(stats, log, seat) {
  stats.games += 1;
  const rawScores = [log.sc[0], log.sc[2], log.sc[4], log.sc[6]].map(Number);
  const resultScores = [log.sc[1], log.sc[3], log.sc[5], log.sc[7]].map(Number);
  const rank = [...Array(4).keys()].sort((a, b) => resultScores[b] - resultScores[a]).indexOf(seat);
  stats.rankCounts[rank] += 1;
  stats.finalScoreByRank[rank] += rawScores[seat];
  if (rawScores[seat] < 0) stats.negativeGames += 1;
}

function yakuLabels(win) {
  return (win[2] || []).slice(4).map(String);
}

function pointDelta(result, seat) {
  return Number((result[1] || [])[seat] || 0);
}

function addHandStats(allStats, hand, seatIdentities) {
  const dealer = Number(hand[0][0]) % 4;
  const states = seatIdentities.map((identity, seat) => ({ identity, seat, ...playerHandState(hand, seat) }));
  const results = resultDetails(hand);
  const wins = results.filter((result) => result[0] === "和了");
  const exhaustiveDraw = results.some((result) => result[0] === "流局");

  const reachOrder = states
    .filter((state) => state.riichi)
    .sort((a, b) => {
      const turnA = a.reachIndex * 4 + ((a.seat - dealer + 4) % 4);
      const turnB = b.reachIndex * 4 + ((b.seat - dealer + 4) % 4);
      return turnA - turnB;
    });

  for (const state of states) {
    const stats = allStats[state.identity];
    stats.hands += 1;
    const init = hand[4 + state.seat * 3] || [];
    const initShanten = initialShanten(init);
    stats.initialShantenSum += initShanten;
    if (state.seat === dealer) {
      stats.dealerHands += 1;
      stats.dealerShantenSum += initShanten;
      stats.maxDealerRepeat = Math.max(stats.maxDealerRepeat, Number(hand[0][1]) + 1);
    } else {
      stats.childHands += 1;
      stats.childShantenSum += initShanten;
    }
    if (state.openCall) stats.furoHands += 1;
    if (state.riichi) {
      stats.riichiHands += 1;
      stats.riichiTurnSum += state.reachIndex + 1;
      stats.riichiNetSum += results.reduce((sum, result) => sum + pointDelta(result, state.seat), 0);
    }

    if (reachOrder.length && state.riichi) {
      if (reachOrder[0].seat === state.seat) {
        stats.firstRiichi += 1;
        if (reachOrder.length > 1) stats.firstRiichiChased += 1;
      } else {
        stats.chaseRiichi += 1;
      }
    }

    const playerWins = wins.filter((win) => Number(win[2][0]) === state.seat);
    if (playerWins.length) {
      stats.wins += 1;
      const win = playerWins[0];
      const winner = Number(win[2][0]);
      const target = Number(win[2][1]);
      if (winner === target) stats.tsumoWins += 1;
      if (state.riichi) stats.riichiWins += 1;
      else if (state.openCall) stats.furoWins += 1;
      else stats.damaWins += 1;
      const income = playerWins.reduce((sum, item) => sum + Math.max(0, pointDelta(item, state.seat)), 0);
      stats.winPointSum += income;
      stats.winTurnSum += state.discardCount + (winner === target ? 1 : 0);
      if (state.riichi) stats.riichiWinIncome += income;
      const labels = yakuLabels(win);
      if (labels.some((label) => label.includes("一発"))) stats.ippatsuWins += 1;
      if (labels.some((label) => label.includes("裏ドラ"))) stats.uraWins += 1;
      if (String(win[2][3] || "").includes("役満")) stats.yakumanWins += 1;
      if (labels.some((label) => label.includes("ダブル立直"))) stats.doubleRiichi += 1;
      const fan = labels.reduce((sum, label) => sum + Number((label.match(/\((\d+)飜\)/) || [])[1] || 0), 0);
      stats.maxFan = Math.max(stats.maxFan, fan);
    }

    const dealIns = wins.filter((win) => Number(win[2][1]) === state.seat && Number(win[2][0]) !== state.seat);
    if (dealIns.length) {
      stats.dealInHands += 1;
      stats.dealInEvents += dealIns.length;
      const cost = dealIns.reduce((sum, win) => sum + Math.max(0, -pointDelta(win, state.seat)), 0);
      stats.dealInPointSum += cost;
      if (state.riichi) {
        stats.dealInWhileRiichi += 1;
        stats.riichiDealInCost += cost;
      }
      if (state.openCall) stats.dealInWhileFuro += 1;
      for (const win of dealIns) {
        const winnerState = states[Number(win[2][0])];
        if (winnerState.riichi) stats.dealInToRiichi += 1;
        else if (winnerState.openCall) stats.dealInToFuro += 1;
        else stats.dealInToDama += 1;
      }
    }

    const opponentTsumo = wins.find((win) => Number(win[2][0]) === Number(win[2][1]) && Number(win[2][0]) !== state.seat);
    if (opponentTsumo) {
      stats.tsumoLossHands += 1;
      const winnerSeat = Number(opponentTsumo[2][0]);
      stats.tsumoLossValueSum += Math.max(0, pointDelta(opponentTsumo, winnerSeat));
    }

    if (exhaustiveDraw) {
      stats.drawHands += 1;
      if (state.riichi) stats.drawWhileRiichi += 1;
      if (state.openCall) stats.drawWhileFuro += 1;
      const draw = results.find((result) => result[0] === "流局");
      if (pointDelta(draw, state.seat) > 0 || state.riichi) stats.drawTenpaiHands += 1;
    }
  }
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function rounded(value, digits = 6) {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function finalize(stats) {
  const avgWin = ratio(stats.winPointSum, stats.wins);
  const avgDealIn = ratio(stats.dealInPointSum, stats.dealInEvents);
  return {
    对局数: stats.games,
    一位率: rounded(ratio(stats.rankCounts[0], stats.games)),
    二位率: rounded(ratio(stats.rankCounts[1], stats.games)),
    三位率: rounded(ratio(stats.rankCounts[2], stats.games)),
    四位率: rounded(ratio(stats.rankCounts[3], stats.games)),
    平均顺位: rounded(stats.rankCounts.reduce((sum, count, index) => sum + count * (index + 1), 0) / stats.games),
    被击飞率: rounded(ratio(stats.negativeGames, stats.games)),
    统计局数: stats.hands,
    和牌率: rounded(ratio(stats.wins, stats.hands)),
    自摸率: rounded(ratio(stats.tsumoWins, stats.wins)),
    默听率: rounded(ratio(stats.damaWins, stats.wins)),
    放铳率: rounded(ratio(stats.dealInHands, stats.hands)),
    副露率: rounded(ratio(stats.furoHands, stats.hands)),
    立直率: rounded(ratio(stats.riichiHands, stats.hands)),
    平均打点: rounded(avgWin, 0),
    最大连庄: stats.maxDealerRepeat,
    和了巡数: rounded(ratio(stats.winTurnSum, stats.wins), 3),
    平均铳点: rounded(avgDealIn, 0),
    流局率: rounded(ratio(stats.drawHands, stats.hands)),
    流听率: rounded(ratio(stats.drawTenpaiHands, stats.drawHands)),
    一发率: rounded(ratio(stats.ippatsuWins, stats.riichiWins)),
    里宝率: rounded(ratio(stats.uraWins, stats.riichiWins)),
    被炸率: rounded(ratio(stats.tsumoLossHands, stats.hands)),
    平均被炸点数: rounded(ratio(stats.tsumoLossValueSum, stats.tsumoLossHands), 0),
    放铳时立直率: rounded(ratio(stats.dealInWhileRiichi, stats.dealInHands)),
    放铳时副露率: rounded(ratio(stats.dealInWhileFuro, stats.dealInHands)),
    立直后放铳率: rounded(ratio(stats.dealInWhileRiichi, stats.riichiHands)),
    立直后非瞬间放铳率: null,
    副露后放铳率: rounded(ratio(stats.dealInWhileFuro, stats.furoHands)),
    立直后和牌率: rounded(ratio(stats.riichiWins, stats.riichiHands)),
    副露后和牌率: rounded(ratio(stats.furoWins, stats.furoHands)),
    立直后流局率: rounded(ratio(stats.drawWhileRiichi, stats.riichiHands)),
    副露后流局率: rounded(ratio(stats.drawWhileFuro, stats.furoHands)),
    放铳至立直: stats.dealInToRiichi,
    放铳至副露: stats.dealInToFuro,
    放铳至默听: stats.dealInToDama,
    立直和了: stats.riichiWins,
    副露和了: stats.furoWins,
    默听和了: stats.damaWins,
    立直巡目: rounded(ratio(stats.riichiTurnSum, stats.riichiHands), 3),
    立直收支: rounded(ratio(stats.riichiNetSum, stats.riichiHands), 0),
    立直收入: rounded(ratio(stats.riichiWinIncome, stats.riichiWins), 0),
    立直支出: rounded(ratio(stats.riichiDealInCost, stats.dealInWhileRiichi), 0),
    先制率: rounded(ratio(stats.firstRiichi, stats.riichiHands)),
    追立率: rounded(ratio(stats.chaseRiichi, stats.riichiHands)),
    被追率: rounded(ratio(stats.firstRiichiChased, stats.firstRiichi)),
    振听立直率: null,
    立直好型: null,
    立直多面: null,
    立直好型2: null,
    役满: stats.yakumanWins,
    最大累计番数: stats.maxFan,
    W立直: stats.doubleRiichi,
    打点效率: rounded(ratio(stats.winPointSum, stats.hands), 0),
    铳点损失: rounded(ratio(stats.dealInPointSum, stats.hands), 0),
    净打点效率: rounded(ratio(stats.winPointSum - stats.dealInPointSum, stats.hands), 0),
    平均起手向听: rounded(ratio(stats.initialShantenSum, stats.hands), 3),
    平均起手向听亲: rounded(ratio(stats.dealerShantenSum, stats.dealerHands), 3),
    平均起手向听子: rounded(ratio(stats.childShantenSum, stats.childHands), 3),
  };
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeOutputs(summary, mappings, missingMatches, unmatchedLogs) {
  const jsonFile = path.join(OUTPUT_DIR, "1st_MRC_牌谱屋维度统计.json");
  fs.writeFileSync(jsonFile, `${JSON.stringify({ summary, missingMatches, mappings, unmatchedLogs }, null, 2)}\n`);

  const fields = [...new Set(IDENTITIES.flatMap((identity) => Object.keys(summary[identity])))];
  const csv = [["玩家", ...fields], ...IDENTITIES.map((identity) => [identity, ...fields.map((field) => summary[identity][field])])]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, "1st_MRC_牌谱屋维度统计.csv"), `\uFEFF${csv}\n`);

  const percentFields = new Set([
    "一位率", "二位率", "三位率", "四位率", "被击飞率", "和牌率", "自摸率", "默听率", "放铳率", "副露率", "立直率",
    "流局率", "流听率", "一发率", "里宝率", "被炸率", "放铳时立直率", "放铳时副露率", "立直后放铳率", "副露后放铳率",
    "立直后和牌率", "副露后和牌率", "立直后流局率", "副露后流局率", "先制率", "追立率", "被追率",
  ]);
  const display = (field, value) => {
    if (value == null) return "不可可靠还原";
    if (percentFields.has(field)) return `${(value * 100).toFixed(2)}%`;
    return String(value);
  };
  const core = ["对局数", "统计局数", "一位率", "二位率", "三位率", "四位率", "平均顺位", "和牌率", "放铳率", "副露率", "立直率", "平均打点", "平均铳点", "流局率", "流听率"];
  const lines = [
    "# 1st MRC 人机大战牌谱统计",
    "",
    `- Excel 记录场数：29`,
    `- 已取得并匹配牌谱：${mappings.length}`,
    `- 缺失局号：${missingMatches.join("、") || "无"}`,
    `- 分数不匹配、待确认局号的牌谱：${unmatchedLogs.map((item) => item.logId).join("、") || "无"}`,
    `- 数据修正：${mappings.filter((item) => item.correction).map((item) => item.correction).join("；") || "无"}`,
    "- 身份口径：xuanxuan=hmx，xiaop=xiaop，nagaカガシ=NAGA，Mortal 4.1b=Mortal。",
    "",
    "## 核心统计",
    "",
    `| 维度 | ${IDENTITIES.join(" | ")} |`,
    `|---|${IDENTITIES.map(() => "---:").join("|")}|`,
    ...core.map((field) => `| ${field} | ${IDENTITIES.map((identity) => display(field, summary[identity][field])).join(" | ")} |`),
    "",
    "## 局号与牌谱对应",
    "",
    "| Excel局号 | 牌谱ID | 天凤原账号座次 |",
    "|---:|---|---|",
    ...mappings
      .slice()
      .sort((a, b) => a.matchNumber - b.matchNumber)
      .map((item) => `| ${item.matchNumber} | ${item.logId} | ${item.seats.map((seat) => `${seat.identity}=${seat.name}`).join("；")}${item.correction ? `（${item.correction}）` : ""} |`),
    "",
    "## 分数不匹配、待确认局号的牌谱",
    "",
    "| 牌谱ID | 天凤账号与比赛分 | 处理 |",
    "|---|---|---|",
    ...unmatchedLogs.map((item) => `| ${item.logId} | ${item.seats.map((seat) => `${seat.name} ${seat.score >= 0 ? "+" : ""}${seat.score.toFixed(1)}`).join("；")} | Excel 无相同分数组合，待确认局号；暂未纳入汇总 |`),
    "",
    "## 口径说明",
    "",
    "统计按天凤原始牌谱逐局累计。副露率只计吃、碰、明杠与加杠，暗杠不计；放铳率按发生放铳的局计，双响仍只占一局。",
    "已确认的数据修正：第25局以 bddca1e2 牌谱为准；第26局 Excel 中 NAGA 与 Mortal 的分数写反。",
    "平均打点、平均铳点及效率使用牌谱结算 delta，包含本场棒与立直棒影响，可能与牌谱屋内部的纯打点口径有小幅差异。",
    "紧凑 JSON 不直接提供听牌形与完整事件时间线，因此振听立直率、立直好型系列、立直后非瞬间放铳率留空；先制/追立按立直巡目和座次重建，极少数有副露插入的同巡立直可能存在次序误差。",
    "流局全员零收支时无法仅凭紧凑 JSON 区分四家听牌与四家不听，流听率可能受此影响。",
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, "1st_MRC_牌谱统计报告.md"), `${lines.join("\n")}\n`);
}

function main() {
  const excelMatches = readExcelScores();
  const logIds = readLogIds();
  const logs = logIds.map(fetchLog);
  const allStats = Object.fromEntries(IDENTITIES.map((identity) => [identity, createStats()]));
  const mappings = [];
  const unmatchedLogs = [];
  const matchedNumbers = new Set();

  for (const log of logs) {
    let matched;
    try {
      matched = matchLogToExcel(log, excelMatches);
    } catch (error) {
      const scores = competitionScores(log);
      unmatchedLogs.push({
        logId: log.ref,
        reason: error.message,
        seats: log.name.map((name, seat) => ({ name, score: scores[seat] })),
      });
      continue;
    }
    const { excelMatch, seatIdentities, correction } = matched;
    if (matchedNumbers.has(excelMatch.matchNumber)) throw new Error(`Excel 第 ${excelMatch.matchNumber} 局被重复匹配`);
    matchedNumbers.add(excelMatch.matchNumber);
    const rawScores = [log.sc[0], log.sc[2], log.sc[4], log.sc[6]].map(Number);
    const rankOrder = [...Array(4).keys()].sort((a, b) => rawScores[b] - rawScores[a] || a - b);
    const rankBySeat = Array(4);
    rankOrder.forEach((seat, rank) => { rankBySeat[seat] = rank; });
    const rankPoints = [30, 10, -10, -30];
    const seats = seatIdentities.map((identity, seat) => ({
      identity,
      name: log.name[seat],
      score: (rawScores[seat] - 25000) / 1000 + rankPoints[rankBySeat[seat]],
    }));
    mappings.push({ matchNumber: excelMatch.matchNumber, logId: log.ref, seats, correction });
    for (let seat = 0; seat < 4; seat += 1) addGameStats(allStats[seatIdentities[seat]], log, seat);
    for (const hand of log.log) addHandStats(allStats, hand, seatIdentities);
  }

  const missingMatches = excelMatches.map((item) => item.matchNumber).filter((number) => !matchedNumbers.has(number));
  const summary = Object.fromEntries(IDENTITIES.map((identity) => [identity, finalize(allStats[identity])]));
  writeOutputs(summary, mappings, missingMatches, unmatchedLogs);
  console.log(JSON.stringify({ logCount: logs.length, matchedCount: mappings.length, missingMatches, unmatchedLogs, mappings, summary }, null, 2));
}

if (require.main === module) main();

module.exports = {
  addGameStats,
  addHandStats,
  competitionScores,
  createStats,
  fetchLog,
  finalize,
  matchLogToExcel,
  readExcelScores,
  readLogIds,
};
