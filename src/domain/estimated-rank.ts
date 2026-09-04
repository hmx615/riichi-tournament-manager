import { summarizeNagaMetrics, summarizeNagaMetricsByUnit } from "./naga-summary";

export type RatingMetrics = {
  model: string;
  rating: number;
  agreementRate: number;
  badMoveRate: number;
  decisionCount: number;
};

type Calibration = {
  rating: number[];
  agreementRate: number[];
  badMoveRate: number[];
};

export type EstimatedRank = number | "10+";
export type EstimatedRankPerspective = "game" | "decision" | "hand";

// 2024年1月至3月天凤段位别 NAGA 统计，数组下标分别对应初段至十段。
const calibrations: Record<string, Calibration> = {
  "ニシキ": {
    rating: [79.4, 80.2, 81.4, 82.9, 84.6, 86.4, 88.3, 89.5, 90.3, 90.6],
    agreementRate: [0.656, 0.665, 0.68, 0.698, 0.718, 0.741, 0.765, 0.781, 0.791, 0.795],
    badMoveRate: [0.151, 0.141, 0.127, 0.111, 0.095, 0.076, 0.06, 0.049, 0.042, 0.039],
  },
  "カガシ": {
    rating: [78.1, 78.9, 80.1, 81.6, 83.1, 84.7, 86.4, 87.4, 88.0, 88.3],
    agreementRate: [0.652, 0.661, 0.676, 0.693, 0.711, 0.73, 0.751, 0.763, 0.77, 0.774],
    badMoveRate: [0.163, 0.152, 0.138, 0.123, 0.107, 0.092, 0.076, 0.067, 0.062, 0.058],
  },
};

function interpolateRank(value: number, curve: number[]) {
  const increasing = curve[curve.length - 1] > curve[0];
  if ((increasing && value <= curve[0]) || (!increasing && value >= curve[0])) return 1;
  if ((increasing && value >= curve[curve.length - 1]) || (!increasing && value <= curve[curve.length - 1])) return 10;
  for (let index = 0; index < curve.length - 1; index += 1) {
    const start = curve[index];
    const end = curve[index + 1];
    if ((increasing && value >= start && value <= end) || (!increasing && value <= start && value >= end)) {
      return index + 1 + (value - start) / (end - start);
    }
  }
  return null;
}

export function estimateRankByPerspective(ratings: RatingMetrics[], perspective: EstimatedRankPerspective) {
  const ratingsByModel = new Map<string, RatingMetrics[]>();
  for (const rating of ratings) {
    if (!calibrations[rating.model]) continue;
    ratingsByModel.set(rating.model, [...(ratingsByModel.get(rating.model) || []), rating]);
  }
  const modelRanks = [...ratingsByModel.entries()].flatMap(([model, values]) => {
    const calibration = calibrations[model];
    // Game and hand perspectives both expect one pre-aggregated observation per selected unit.
    const summary = perspective === "decision" ? summarizeNagaMetrics(values) : summarizeNagaMetricsByUnit(values);
    if (!summary) return [];
    const estimates = [
      interpolateRank(summary.rating, calibration.rating),
      interpolateRank(summary.agreementRate, calibration.agreementRate),
      interpolateRank(summary.badMoveRate, calibration.badMoveRate),
    ].filter((value): value is number => value !== null && Number.isFinite(value));
    return estimates.length ? [estimates.reduce((sum, rank) => sum + rank, 0) / estimates.length] : [];
  });
  if (!modelRanks.length) return null;
  return Number((modelRanks.reduce((sum, rank) => sum + rank, 0) / modelRanks.length).toFixed(1));
}

export function estimateRankByGame(ratings: RatingMetrics[]) {
  return estimateRankByPerspective(ratings, "game");
}

export function estimateRankByDecision(ratings: RatingMetrics[]) {
  return estimateRankByPerspective(ratings, "decision");
}

export function estimateRankByHand(handRatings: RatingMetrics[]) {
  return estimateRankByPerspective(handRatings, "hand");
}

export function estimateRank(ratings: RatingMetrics[]) {
  return estimateRankByGame(ratings);
}

export function formatEstimatedRank(rank: EstimatedRank | null) {
  if (rank == null) return "-";
  return rank === "10+" ? "10+段" : `${rank.toFixed(1)}段`;
}
