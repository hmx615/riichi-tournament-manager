#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excelFile = process.argv[2] || "/home/XXH-07652/Desktop/个人文档/麻将/xxc/1st XRC.xlsx";
const competition = JSON.parse(fs.readFileSync(path.join(root, "data", "competitions", "1st-xrc.json"), "utf8"));
const scoreRows = { hmx: 4, xiaop: 5, NAGA: 6, Mortal: 7 };
const ratingColumns = {
  hmx: { "ニシキ": 9, "カガシ": 10 },
  xiaop: { "ニシキ": 13, "カガシ": 14 },
};

function xmlDecode(value) {
  return value.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function columnNumber(ref) {
  const letters = ref.match(/[A-Z]+/)[0];
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result;
}

function parseSheet(xml, sharedStrings) {
  const rows = new Map();
  for (const rowMatch of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = new Map();
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = (cellMatch[1].match(/r="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const type = (cellMatch[1].match(/t="([^"]+)"/) || [])[1];
      const raw = (cellMatch[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
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
  const unzip = (entry) => execFileSync("unzip", ["-p", excelFile, entry], { encoding: "utf8", maxBuffer: 30 << 20 });
  const sharedStrings = [...unzip("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    xmlDecode([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")),
  );
  return parseSheet(unzip("xl/worksheets/sheet2.xml"), sharedStrings);
}

const excel = readExcel();
const tableMatchCount = Number(excel.get(2)?.get(5));
const mismatches = [];
for (let matchNumber = 1; matchNumber <= tableMatchCount; matchNumber += 1) {
  const match = competition.matches.find((item) => item.matchNumber === matchNumber);
  if (!match) {
    mismatches.push({ matchNumber, kind: "missing_match", detail: "网站缺少该场" });
    continue;
  }
  for (const [participantId, row] of Object.entries(scoreRows)) {
    const tableValue = Number(excel.get(row)?.get(6 + matchNumber));
    const sourceValue = match.seats.find((seat) => seat.participantId === participantId)?.competitionPoints;
    if (!Number.isFinite(tableValue) || !Number.isFinite(sourceValue) || Math.abs(tableValue - sourceValue) >= 0.011) {
      mismatches.push({ matchNumber, kind: "score", participantId, tableValue, sourceValue });
    }
  }
  for (const [participantId, models] of Object.entries(ratingColumns)) {
    for (const [model, column] of Object.entries(models)) {
      const tableValue = Number(excel.get(11 + matchNumber)?.get(column));
      const sourceValue = match.nagaRatings?.find((rating) => rating.participantId === participantId && rating.model === model)?.rating;
      if (!Number.isFinite(tableValue) || !Number.isFinite(sourceValue) || Math.abs(tableValue - sourceValue) >= 0.11) {
        mismatches.push({ matchNumber, kind: "rating", participantId, model, tableValue, sourceValue });
      }
    }
  }
}

const websiteOnly = competition.matches.filter((match) => match.matchNumber > tableMatchCount).map((match) => match.matchNumber);
const mismatchMatches = [...new Set(mismatches.map((item) => item.matchNumber))].sort((left, right) => left - right);
process.stdout.write(`${JSON.stringify({ excelFile, tableMatchCount, websiteMatchCount: competition.matches.length, mismatchMatches, mismatches, websiteOnly }, null, 2)}\n`);
