export const majsoulRanks = [
  "初心1",
  "初心2",
  "初心3",
  "雀士1",
  "雀士2",
  "雀士3",
  "雀杰1",
  "雀杰2",
  "雀杰3",
  "雀豪1",
  "雀豪2",
  "雀豪3",
  "雀圣1",
  "雀圣2",
  "雀圣3",
  "魂天",
] as const;

export type MajsoulRank = (typeof majsoulRanks)[number];
export type MajsoulRankTier = "初心" | "雀士" | "雀杰" | "雀豪" | "雀圣" | "魂天";

export const majsoulCelestialLevels = Array.from({ length: 20 }, (_, index) => index + 1);

const tierByPrefix: Record<string, MajsoulRankTier> = {
  初心: "初心",
  雀士: "雀士",
  雀杰: "雀杰",
  雀豪: "雀豪",
  雀圣: "雀圣",
  魂天: "魂天",
};

export function majsoulRankTier(rank: MajsoulRank): MajsoulRankTier {
  return tierByPrefix[rank.slice(0, 2)];
}

export function majsoulRankDivision(rank: MajsoulRank): number | null {
  if (rank === "魂天") return null;
  return Number(rank.at(-1));
}

export function isMajsoulCelestialLevel(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 20;
}

export function formatMajsoulRank(rank: MajsoulRank, celestialLevel?: number): string {
  return rank === "魂天" && celestialLevel ? `魂天 Lv.${celestialLevel}` : rank;
}
