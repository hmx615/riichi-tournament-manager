export type MetricType = "rate" | "decimal" | "point" | "signed";

export type Metric = readonly [field: string, type: MetricType];

/** 个人页三个数据框的指标与顺序，界面与数据传输共用同一份定义。 */
export const METRIC_GROUPS: Array<{ title: string; metrics: Metric[] }> = [
  { title: "攻守与选择", metrics: [["和牌率", "rate"], ["放铳率", "rate"], ["副露率", "rate"], ["立直率", "rate"], ["自摸率", "rate"], ["默听率", "rate"], ["流听率", "rate"], ["先制率", "rate"], ["追立率", "rate"], ["平均起手向听", "decimal"]] },
  { title: "打点与收支", metrics: [["平均打点", "point"], ["平均铳点", "point"], ["被炸率", "rate"], ["平均被炸点数", "point"], ["打点效率", "point"], ["铳点损失", "point"], ["净打点效率", "signed"], ["局收支", "signed"], ["里宝率", "rate"], ["平均里宝数", "decimal"]] },
  { title: "立直与副露", metrics: [["立直后和牌率", "rate"], ["立直后放铳率", "rate"], ["立直后流局率", "rate"], ["立直多面率", "rate"], ["立直好型率", "rate"], ["平均立直巡目", "decimal"], ["和了巡数", "decimal"], ["副露后和牌率", "rate"], ["副露后放铳率", "rate"], ["副露后流局率", "rate"]] },
];

/** 对比只需要这 30 个字段，不必把每个人的全部统计都发给客户端。 */
export const COMPARE_METRIC_FIELDS: string[] = METRIC_GROUPS.flatMap((group) => group.metrics.map(([field]) => field));

/** 从完整统计里挑出对比用得到的字段。 */
export function pickCompareMetrics(summary: Record<string, number | null>): Record<string, number | null> {
  return Object.fromEntries(COMPARE_METRIC_FIELDS.map((field) => [field, summary[field] ?? null]));
}

/** 对比时某一侧相对另一侧的优劣，null 表示不比较。 */
export type MetricTone = "better" | "worse" | null;

/** 越大越好的指标。 */
const HIGHER_IS_BETTER = new Set([
  "和牌率",
  "自摸率",
  "流听率",
  "立直率",
  "先制率",
  "追立率",
  "平均打点",
  "打点效率",
  "净打点效率",
  "局收支",
  "里宝率",
  "平均里宝数",
  "立直后和牌率",
  "立直多面率",
  "立直好型率",
  "副露后和牌率",
]);

/** 越小越好的指标。 */
const LOWER_IS_BETTER = new Set([
  "放铳率",
  "平均起手向听",
  "平均铳点",
  "被炸率",
  "平均被炸点数",
  "铳点损失",
  "立直后放铳率",
  "副露后放铳率",
  "平均立直巡目",
  "和了巡数",
]);

export function metricDirection(field: string): "higher" | "lower" | null {
  if (HIGHER_IS_BETTER.has(field)) return "higher";
  if (LOWER_IS_BETTER.has(field)) return "lower";
  // 副露率、默听率、立直后流局率、副露后流局率属于打法风格，不判优劣。
  return null;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 判断自己的这一份数据`mine`相对对手`theirs`是优还是劣。
 * 缺失数据、不判优劣的指标、双方打平都返回 null（不染色）。
 */
export function metricTone(
  field: string,
  mine: number | null | undefined,
  theirs: number | null | undefined,
): MetricTone {
  const direction = metricDirection(field);
  if (!direction || !isNumber(mine) || !isNumber(theirs) || mine === theirs) return null;
  const mineIsBetter = direction === "higher" ? mine > theirs : mine < theirs;
  return mineIsBetter ? "better" : "worse";
}

export function formatMetricValue(value: number | null | undefined, type: MetricType) {
  if (!isNumber(value)) return "-";
  if (type === "rate") return `${(value * 100).toFixed(2)}%`;
  if (type === "decimal") return value.toFixed(2);
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

/** 悬停提示里的差值文案，缺失或打平时返回 null。 */
export function formatMetricDelta(
  type: MetricType,
  mine: number | null | undefined,
  theirs: number | null | undefined,
) {
  if (!isNumber(mine) || !isNumber(theirs) || mine === theirs) return null;
  const difference = mine - theirs;
  const sign = difference > 0 ? "+" : "";
  if (type === "rate") return `${sign}${(difference * 100).toFixed(2)} pt`;
  if (type === "decimal") return `${sign}${difference.toFixed(2)}`;
  return `${sign}${Math.round(difference).toLocaleString("zh-CN")}`;
}
