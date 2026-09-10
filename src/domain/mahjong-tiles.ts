const sourceAliases: Record<string, string> = {
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

const honorFiles = ["", "Ton", "Nan", "Shaa", "Pei", "Haku", "Hatsu", "Chun"];
const honorLabels = ["", "东", "南", "西", "北", "白", "发", "中"];
const suitNames = { m: "万", p: "饼", s: "索" } as const;
const suitFiles = { m: "Man", p: "Pin", s: "Sou" } as const;

export function normalizeTileCode(tile: string) {
  return sourceAliases[tile] || tile;
}

export function tileImagePath(tile: string) {
  const normalized = normalizeTileCode(tile);
  const rank = Number(normalized[0]);
  const suit = normalized[1] as "m" | "p" | "s" | "z";
  if (suit === "z" && rank >= 1 && rank <= 7) return `/mahjong-tiles/${honorFiles[rank]}.svg`;
  if (suit in suitFiles && rank >= 0 && rank <= 9) {
    const red = rank === 0;
    return `/mahjong-tiles/${suitFiles[suit as keyof typeof suitFiles]}${red ? "5Red" : rank}.svg`;
  }
  throw new Error(`未知牌码：${tile}`);
}

export function tileLabel(tile: string) {
  const normalized = normalizeTileCode(tile);
  const rank = Number(normalized[0]);
  const suit = normalized[1] as "m" | "p" | "s" | "z";
  if (suit === "z") return honorLabels[rank] || normalized;
  if (suit in suitNames) return `${rank === 0 ? "赤五" : rank}${suitNames[suit as keyof typeof suitNames]}`;
  return normalized;
}
