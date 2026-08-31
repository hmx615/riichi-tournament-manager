#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  addGameStats,
  addHandStats,
  competitionScores,
  createStats,
  fetchLog,
  finalize,
} = require("./mrc_stats.js");

const ROOT = __dirname;
const INPUT_FILE = path.join(ROOT, "XRC牌谱录入.txt");
const EXCEL_FILE = "/home/XXH-07652/Desktop/个人文档/麻将/xxc/1st XRC.xlsx";
const NAGA_CACHE_DIR = path.join(ROOT, "naga_cache");
const OUTPUT_FILE = path.join(ROOT, "1st_XRC_四人数据对比.html");
const IDENTITIES = ["hmx", "xiaop", "NAGA", "Mortal"];
const EXCEL_ROWS = { hmx: 4, xiaop: 5, NAGA: 6, Mortal: 7 };
const COLORS = { hmx: "#d1495b", xiaop: "#168f83", NAGA: "#6657c7", Mortal: "#d58a18" };

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
  return execFileSync("unzip", ["-p", file, entry], { encoding: "utf8", maxBuffer: 30 << 20 });
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
      let value = raw ?? "";
      if (type === "s") value = sharedStrings[Number(raw)] ?? "";
      else if (value !== "" && Number.isFinite(Number(value))) value = Number(value);
      row.set(columnNumber(ref), value);
    }
    rows.set(Number(rowMatch[1]), row);
  }
  return rows;
}

function readExcel() {
  const sharedXml = readZipEntry(EXCEL_FILE, "xl/sharedStrings.xml");
  const sharedStrings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    xmlDecode([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")),
  );
  return parseSheet(readZipEntry(EXCEL_FILE, "xl/worksheets/sheet2.xml"), sharedStrings);
}

function readEntries() {
  const entries = [];
  for (const [index, rawLine] of fs.readFileSync(INPUT_FILE, "utf8").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const fields = line.split(/\t+/).map((field) => field.trim()).filter(Boolean);
    const matchNumber = Number(fields[0]);
    const url = fields.find((field) => /^https?:\/\//.test(field));
    const seatsField = fields.find((field) => field.startsWith("seats="));
    const seats = seatsField ? seatsField.slice(6).split(",").map((item) => item.trim()) : null;
    if (!Number.isInteger(matchNumber) || !url) throw new Error(`录入文件第 ${index + 1} 行格式错误`);
    if (seats && (seats.length !== 4 || new Set(seats).size !== 4 || seats.some((id) => !IDENTITIES.includes(id)))) {
      throw new Error(`录入文件第 ${index + 1} 行 seats 必须包含四个不同身份`);
    }
    entries.push({ matchNumber, url, seats, line: index + 1 });
  }
  const matchNumbers = entries.map((entry) => entry.matchNumber);
  if (new Set(matchNumbers).size !== matchNumbers.length) throw new Error("录入文件存在重复局号");
  return entries.sort((a, b) => a.matchNumber - b.matchNumber);
}

function fetchNagaReport(reportId) {
  fs.mkdirSync(NAGA_CACHE_DIR, { recursive: true });
  const cacheFile = path.join(NAGA_CACHE_DIR, `${reportId}.json`);
  if (!fs.existsSync(cacheFile)) {
    const url = `https://ricochet.cn/api/naga/proxy/reports/${reportId}.json.gz`;
    const body = execFileSync(
      "curl",
      ["--compressed", "-L", "-sS", "--max-time", "30", "-A", "Mozilla/5.0", url],
      { encoding: "utf8", maxBuffer: 100 << 20 },
    );
    const parsed = JSON.parse(body);
    fs.writeFileSync(cacheFile, `${JSON.stringify(parsed)}\n`);
  }
  return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
}

function resolveSource(entry) {
  const tenhou = entry.url.match(/[?&]log=([^&#]+)/);
  if (tenhou) return { ...entry, sourceType: "天凤", logId: tenhou[1], reportId: null };
  const naga = entry.url.match(/[?&]report_id=([^&#]+)/);
  if (!naga) throw new Error(`第 ${entry.line} 行不是可识别的天凤或 NAGA 链接`);
  const report = fetchNagaReport(naga[1]);
  return { ...entry, sourceType: "NAGA", logId: report.haihu_id, reportId: naga[1] };
}

function inferSeats(names) {
  const seats = names.map((name) => {
    if (/NAGA/i.test(name)) return "NAGA";
    if (name === "NoName") return "Mortal";
    if (name === "東海大黄魚") return "hmx";
    if (/^(風蛍月|こくらあさひ|lechanNa|ハンバーガー)$/.test(name)) return "xiaop";
    return null;
  });
  return seats.every(Boolean) && new Set(seats).size === 4 ? seats : null;
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.011;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2)) : null;
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* function buildHtmlLegacy(data) {
  const embedded = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>1st XRC 四人数据对比</title>
  <style>
    :root { --ink:#20252b; --muted:#69717b; --line:#dfe3e7; --soft:#f4f6f7; --paper:#ffffff; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:#eef1f2; font-family:Inter,"Noto Sans SC","Microsoft YaHei",Arial,sans-serif; letter-spacing:0; }
    header { background:#fff; border-bottom:1px solid var(--line); }
    .header-inner, main, .section-inner { width:min(1180px, calc(100% - 40px)); margin:0 auto; }
    .header-inner { min-height:88px; display:flex; align-items:center; justify-content:space-between; gap:24px; }
    h1 { margin:0; font-size:26px; line-height:1.2; font-weight:760; }
    .meta { color:var(--muted); font-size:13px; text-align:right; line-height:1.6; }
    .player-key { display:flex; flex-wrap:wrap; gap:18px; padding:18px 0 4px; }
    .player-key span { display:inline-flex; align-items:center; gap:7px; font-weight:700; font-size:13px; }
    .dot { width:10px; height:10px; border-radius:50%; flex:0 0 auto; }
    section { background:#fff; border-bottom:1px solid var(--line); }
    section:nth-of-type(even) { background:#f8f9fa; }
    .section-inner { padding:30px 0 34px; }
    h2 { margin:0 0 20px; font-size:18px; line-height:1.35; }
    .rank-legend { display:flex; gap:16px; flex-wrap:wrap; margin:-8px 0 18px; color:var(--muted); font-size:12px; }
    .rank-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:14px; }
    .rank-card { background:var(--paper); border:1px solid var(--line); border-top:4px solid var(--player); border-radius:6px; padding:18px 14px 15px; min-width:0; }
    .rank-name { font-size:15px; font-weight:800; text-align:center; margin-bottom:13px; color:var(--player); }
    .donut-wrap { position:relative; width:150px; height:150px; margin:0 auto; }
    .donut { width:150px; height:150px; border-radius:50%; background:var(--pie); position:relative; }
    .donut::after { content:""; position:absolute; inset:31px; border-radius:50%; background:#fff; box-shadow:0 0 0 1px var(--line); }
    .donut-center { position:absolute; inset:0; z-index:1; display:grid; place-content:center; text-align:center; pointer-events:none; }
    .donut-center strong { font-size:27px; line-height:1; }
    .donut-center small { color:var(--muted); margin-top:6px; }
    .rank-counts { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; margin-top:15px; text-align:center; }
    .rank-counts strong { display:block; font-size:15px; }
    .rank-counts small { color:var(--muted); font-size:11px; }
    .summary-strip { display:grid; grid-template-columns:repeat(4,1fr); border:1px solid var(--line); border-radius:6px; overflow:hidden; margin-top:20px; }
    .summary-item { padding:14px 16px; border-right:1px solid var(--line); background:#fff; }
    .summary-item:last-child { border-right:0; }
    .summary-item small { display:block; color:var(--muted); font-size:11px; margin-bottom:5px; }
    .summary-item strong { font-size:20px; color:var(--player); }
    .comparison-scroll { overflow-x:auto; border:1px solid var(--line); border-radius:6px; background:#fff; }
    .comparison { min-width:870px; }
    .compare-head, .metric-row { display:grid; grid-template-columns:170px repeat(4, minmax(150px,1fr)); }
    .compare-head { position:sticky; top:0; z-index:2; border-bottom:1px solid var(--line); background:#f5f7f8; font-size:12px; font-weight:800; }
    .compare-head > div, .metric-row > div { padding:11px 13px; border-right:1px solid var(--line); }
    .compare-head > div:last-child, .metric-row > div:last-child { border-right:0; }
    .metric-row { border-bottom:1px solid #eaedef; align-items:center; min-height:58px; }
    .metric-row:last-child { border-bottom:0; }
    .metric-label { font-size:13px; font-weight:700; }
    .bar-cell { position:relative; min-width:0; }
    .bar-track { height:7px; border-radius:4px; background:#e8ebed; overflow:hidden; margin-top:7px; }
    .bar-fill { height:100%; background:var(--player); border-radius:4px; min-width:0; }
    .bar-value { font-variant-numeric:tabular-nums; }
    .bar-value strong { font-size:14px; }
    .rating-table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); table-layout:fixed; }
    .rating-table th, .rating-table td { padding:14px 16px; border-bottom:1px solid var(--line); border-right:1px solid var(--line); text-align:right; }
    .rating-table th:first-child, .rating-table td:first-child { text-align:left; width:180px; }
    .rating-table th:last-child, .rating-table td:last-child { border-right:0; }
    .rating-table tr:last-child td { border-bottom:0; }
    .rating-table th { background:#f5f7f8; font-size:12px; }
    .rating-table td { font-size:16px; font-weight:750; }
    .source-table { width:100%; border-collapse:collapse; font-size:12px; }
    .source-table th, .source-table td { padding:9px 10px; border-bottom:1px solid var(--line); text-align:left; white-space:nowrap; }
    .source-table th { color:var(--muted); font-weight:650; }
    .source-table a { color:#315e9b; text-decoration:none; }
    .source-url { color:#4e5963; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
    .source-wrap { overflow-x:auto; }
    footer { color:var(--muted); font-size:11px; padding:20px; text-align:center; }
    @media (max-width:900px) {
      .rank-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .summary-strip { grid-template-columns:repeat(2,1fr); }
      .summary-item:nth-child(2) { border-right:0; }
      .summary-item:nth-child(-n+2) { border-bottom:1px solid var(--line); }
    }
    @media (max-width:560px) {
      .header-inner, main, .section-inner { width:min(100% - 24px,1180px); }
      .header-inner { min-height:104px; align-items:flex-start; flex-direction:column; justify-content:center; gap:6px; }
      .meta { text-align:left; }
      h1 { font-size:22px; }
      .rank-grid { grid-template-columns:1fr; }
      .rank-card { display:grid; grid-template-columns:120px 1fr; align-items:center; padding:14px; }
      .rank-name { grid-column:1/-1; margin-bottom:8px; }
      .donut-wrap, .donut { width:112px; height:112px; }
      .donut::after { inset:24px; }
      .donut-center strong { font-size:21px; }
      .rank-counts { margin:0 0 0 10px; grid-template-columns:repeat(2,1fr); row-gap:12px; }
      .rating-table th, .rating-table td { padding:11px 8px; font-size:12px; }
      .rating-table th:first-child, .rating-table td:first-child { width:112px; }
    }
  </style>
</head>
<body>
  <header><div class="header-inner">
    <h1>1st XRC 四人数据对比</h1>
    <div class="meta" id="meta"></div>
  </div></header>
  <section><div class="section-inner">
    <div class="player-key" id="playerKey"></div>
    <h2>顺位分布</h2>
    <div class="rank-legend"><span>一位</span><span>二位</span><span>三位</span><span>四位</span></div>
    <div class="rank-grid" id="rankGrid"></div>
    <div class="summary-strip" id="summaryStrip"></div>
  </div></section>
  <section><div class="section-inner">
    <h2>攻守与选择</h2>
    <div class="comparison-scroll"><div class="comparison" id="basicMetrics"></div></div>
  </div></section>
  <section><div class="section-inner">
    <h2>打点与效率</h2>
    <div class="comparison-scroll"><div class="comparison" id="pointMetrics"></div></div>
  </div></section>
  <section><div class="section-inner">
    <h2>立直与副露结果</h2>
    <div class="comparison-scroll"><div class="comparison" id="strategyMetrics"></div></div>
  </div></section>
  <section><div class="section-inner">
    <h2>AI 平均 Rating</h2>
    <div style="overflow-x:auto"><table class="rating-table" id="ratingTable"></table></div>
  </div></section>
  <section><div class="section-inner">
    <h2>牌谱与 NAGA 分析</h2>
    <div class="source-wrap"><table class="source-table" id="sourceTable"></table></div>
  </div></section>
  <footer>统计口径：副露不含暗杠；双响放铳按一局计。Rating 直接读取 1st XRC.xlsx。</footer>
  <script>
    const DATA = ${embedded};
    const ids = DATA.identities;
    const rankColors = ["#e3a51a", "#3b91b8", "#8b929a", "#cf5560"];
    const pct = value => value == null ? "—" : (value * 100).toFixed(2) + "%";
    const num = (value, digits=0) => value == null ? "—" : Number(value).toLocaleString("zh-CN", {maximumFractionDigits:digits, minimumFractionDigits:digits});
    document.getElementById("meta").innerHTML = `统计 ${DATA.gameCount} 场 · ${DATA.handCount} 个小局<br>${DATA.generatedDate}`;
    document.getElementById("playerKey").innerHTML = ids.map(id => `<span><i class="dot" style="background:${DATA.colors[id]}"></i>${id}</span>`).join("");

    function pieStops(counts) {
      const total = counts.reduce((a,b)=>a+b,0) || 1;
      let cursor = 0;
      return counts.map((count,index) => {
        const start = cursor; cursor += count / total * 100;
        return `${rankColors[index]} ${start}% ${cursor}%`;
      }).join(",");
    }
    document.getElementById("rankGrid").innerHTML = ids.map(id => {
      const p = DATA.players[id];
      return `<article class="rank-card" style="--player:${DATA.colors[id]}">
        <div class="rank-name">${id}</div>
        <div class="donut-wrap"><div class="donut" style="--pie:conic-gradient(${pieStops(p.rankCounts)})"></div>
          <div class="donut-center"><strong>${p.summary["平均顺位"].toFixed(2)}</strong><small>平均顺位</small></div></div>
        <div class="rank-counts">${p.rankCounts.map((count,i)=>`<div><strong style="color:${rankColors[i]}">${count}</strong><small>${i+1}位 · ${pct(count/DATA.gameCount)}</small></div>`).join("")}</div>
      </article>`;
    }).join("");
    document.getElementById("summaryStrip").innerHTML = ids.map(id => `<div class="summary-item" style="--player:${DATA.colors[id]}"><small>${id} · 比赛总分</small><strong>${DATA.players[id].competitionPoints >= 0 ? "+" : ""}${DATA.players[id].competitionPoints.toFixed(1)}</strong></div>`).join("");

    const metricGroups = {
      basicMetrics: [
        ["和牌率","rate","wins/hands"],["放铳率","rate","dealInHands/hands"],["副露率","rate","furoHands/hands"],
        ["立直率","rate","riichiHands/hands"],["自摸率","rate","tsumoWins/wins"],["默听率","rate","damaWins/wins"],
        ["流听率","rate","drawTenpaiHands/drawHands"],["平均起手向听","decimal",null]
      ],
      pointMetrics: [
        ["平均打点","point","winPointSum/wins"],["平均铳点","point","dealInPointSum/dealInEvents"],
        ["打点效率","point",null],["铳点损失","point",null],["净打点效率","signed",null],
        ["和了巡数","decimal",null],["平均被炸点数","point",null]
      ],
      strategyMetrics: [
        ["立直后和牌率","rate","riichiWins/riichiHands"],["副露后和牌率","rate","furoWins/furoHands"],
        ["立直后放铳率","rate","dealInWhileRiichi/riichiHands"],["副露后放铳率","rate","dealInWhileFuro/furoHands"],
        ["立直后流局率","rate","drawWhileRiichi/riichiHands"],["副露后流局率","rate","drawWhileFuro/furoHands"],
        ["先制率","rate","firstRiichi/riichiHands"],["追立率","rate","chaseRiichi/riichiHands"]
      ]
    };
    function renderMetrics(target, metrics) {
      const header = `<div class="compare-head"><div>指标</div>${ids.map(id=>`<div style="color:${DATA.colors[id]}">${id}</div>`).join("")}</div>`;
      const rows = metrics.map(([field,type]) => {
        const values = ids.map(id => DATA.players[id].summary[field]);
        const finite = values.filter(v=>v!=null && Number.isFinite(v));
        const maxAbs = Math.max(...finite.map(v=>Math.abs(v)), 1);
        return `<div class="metric-row"><div class="metric-label">${field}</div>${ids.map((id,index)=>{
          const value=values[index];
          const width=value==null?0:(type==="rate"?Math.max(0,value*100):Math.abs(value)/maxAbs*100);
          const display=type==="rate"?pct(value):type==="decimal"?num(value,2):num(value,0);
          return `<div class="bar-cell" style="--player:${DATA.colors[id]}"><div class="bar-value"><strong>${display}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></div>`;
        }).join("")}</div>`;
      }).join("");
      document.getElementById(target).innerHTML=header+rows;
    }
    Object.entries(metricGroups).forEach(([target,metrics])=>renderMetrics(target,metrics));

    const models = [["Mortal","Mortal Rating"],["ニシキ","NAGA · ニシキ"],["カガシ","NAGA · カガシ"]];
    document.getElementById("ratingTable").innerHTML = `<thead><tr><th>模型</th>${ids.map(id=>`<th style="color:${DATA.colors[id]}">${id}</th>`).join("")}</tr></thead><tbody>${models.map(([key,label])=>`<tr><td>${label}</td>${ids.map(id=>{const r=DATA.ratings[id]?.[key];return `<td>${r?.average==null?"—":r.average.toFixed(2)}</td>`}).join("")}</tr>`).join("")}</tbody>`;
    document.getElementById("sourceTable").innerHTML = `<thead><tr><th>局号</th><th>原始牌谱链接</th><th>NAGA 分析</th></tr></thead><tbody>${DATA.matches.map(m=>{const tenhouUrl=`https://tenhou.net/3/?log=${m.logId}`;const nagaLink=m.sourceType==="NAGA"?`<a href="${m.url}" target="_blank" rel="noopener noreferrer">打开 NAGA 分析</a>`:"无";return `<tr><td>${m.matchNumber}</td><td><span class="source-url">${tenhouUrl}</span></td><td>${nagaLink}</td></tr>`}).join("")}</tbody>`;
  </script>
</body>
</html>`;
}

*/
function buildHtml(data) {
  const template = fs.readFileSync(path.join(ROOT, "xrc_dashboard_template.html"), "utf8");
  const embedded = JSON.stringify(data).replace(/</g, "\\u003c");
  if (!template.includes("__XRC_DATA__")) throw new Error("HTML template data placeholder is missing");
  return template.replace("__XRC_DATA__", embedded);
}

function main() {
  const excel = readExcel();
  const entries = readEntries().map(resolveSource);
  const logIds = entries.map((entry) => entry.logId);
  if (new Set(logIds).size !== logIds.length) throw new Error("录入文件包含重复牌谱ID");

  const allStats = Object.fromEntries(IDENTITIES.map((identity) => [identity, createStats()]));
  const scoreGameCount = Number(excel.get(2).get(5));
  const competitionPointTotals = Object.fromEntries(IDENTITIES.map((identity) => [identity, 0]));
  const rankCounts = Object.fromEntries(IDENTITIES.map((identity) => [identity, [0, 0, 0, 0]]));
  for (let matchNumber = 1; matchNumber <= scoreGameCount; matchNumber += 1) {
    const column = 6 + matchNumber;
    const scores = Object.fromEntries(IDENTITIES.map((identity) => [identity, Number(excel.get(EXCEL_ROWS[identity]).get(column))]));
    if (Object.values(scores).some((score) => !Number.isFinite(score))) throw new Error(`Excel 第 ${matchNumber} 局分数不完整`);
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (!nearlyEqual(total, 0)) throw new Error(`Excel 第 ${matchNumber} 局不满足零和：${total}`);
    const order = IDENTITIES.slice().sort((a, b) => scores[b] - scores[a] || IDENTITIES.indexOf(a) - IDENTITIES.indexOf(b));
    order.forEach((identity, rank) => { rankCounts[identity][rank] += 1; });
    for (const identity of IDENTITIES) competitionPointTotals[identity] += scores[identity];
  }
  const ratingValues = {
    hmx: { Mortal: [], "ニシキ": [], "カガシ": [] },
    xiaop: { Mortal: [], "ニシキ": [], "カガシ": [] },
  };
  const matches = [];

  for (const entry of entries) {
    const log = fetchLog(entry.logId);
    const seats = entry.seats || inferSeats(log.name);
    if (!seats) throw new Error(`第 ${entry.matchNumber} 局无法自动确认两名人类身份，请填写 seats=`);
    const seatScores = competitionScores(log);
    const excelColumn = 6 + entry.matchNumber;
    if (excel.get(4)?.has(excelColumn)) {
      for (let seat = 0; seat < 4; seat += 1) {
        const expected = Number(excel.get(EXCEL_ROWS[seats[seat]]).get(excelColumn));
        if (!nearlyEqual(expected, seatScores[seat])) {
          throw new Error(`第 ${entry.matchNumber} 局 ${seats[seat]}：Excel ${expected}，牌谱 ${seatScores[seat]}`);
        }
      }
    }
    for (let seat = 0; seat < 4; seat += 1) {
      addGameStats(allStats[seats[seat]], log, seat);
    }
    for (const hand of log.log) addHandStats(allStats, hand, seats);

    const ratingRow = excel.get(11 + entry.matchNumber);
    if (ratingRow) {
      const columns = {
        hmx: { Mortal: 8, "ニシキ": 9, "カガシ": 10 },
        xiaop: { Mortal: 12, "ニシキ": 13, "カガシ": 14 },
      };
      for (const identity of ["hmx", "xiaop"]) {
        for (const [model, column] of Object.entries(columns[identity])) {
          const value = Number(ratingRow.get(column));
          if (Number.isFinite(value)) ratingValues[identity][model].push(value);
        }
      }
    }
    matches.push({ matchNumber: entry.matchNumber, sourceType: entry.sourceType, url: entry.url, logId: entry.logId, seats });
  }

  const players = Object.fromEntries(IDENTITIES.map((identity) => {
    const summary = finalize(allStats[identity]);
    summary["对局数"] = scoreGameCount;
    rankCounts[identity].forEach((count, rank) => { summary[["一位率", "二位率", "三位率", "四位率"][rank]] = count / scoreGameCount; });
    summary["平均顺位"] = rankCounts[identity].reduce((sum, count, rank) => sum + count * (rank + 1), 0) / scoreGameCount;
    return [identity, {
      summary,
      raw: allStats[identity],
      rankCounts: rankCounts[identity],
      competitionPoints: Number(competitionPointTotals[identity].toFixed(1)),
    }];
  }));
  const ratings = Object.fromEntries(IDENTITIES.map((identity) => [identity,
    Object.fromEntries(["Mortal", "ニシキ", "カガシ"].map((model) => {
      const values = ratingValues[identity]?.[model] || [];
      return [model, { average: average(values), count: values.length }];
    })),
  ]));
  const data = {
    identities: IDENTITIES,
    colors: COLORS,
    scoreGameCount,
    dataGameCount: entries.length,
    handCount: allStats.hmx.hands,
    generatedDate: new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date()),
    players,
    ratings,
    matches,
  };
  fs.writeFileSync(OUTPUT_FILE, buildHtml(data));
  process.stdout.write(JSON.stringify({
    output: OUTPUT_FILE,
    scoreGames: data.scoreGameCount,
    dataGames: data.dataGameCount,
    hands: data.handCount,
    ratings,
    summaries: Object.fromEntries(IDENTITIES.map((id) => [id, {
      rankCounts: players[id].rankCounts,
      averageRank: players[id].summary["平均顺位"],
      winRate: players[id].summary["和牌率"],
      dealInRate: players[id].summary["放铳率"],
      callRate: players[id].summary["副露率"],
    }])),
  }, null, 2));
}

main();
