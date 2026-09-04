type NagaMetricInput = {
  rating: number;
  agreementRate: number;
  badMoveRate: number;
  decisionCount: number;
};

export type NagaMetricSummary = {
  rating: number;
  agreementRate: number;
  badMoveRate: number;
  gameCount: number;
  decisionCount: number;
};

export function summarizeNagaMetrics(values: NagaMetricInput[]): NagaMetricSummary | null {
  const valid = values.filter((value) => (
    Number.isFinite(value.rating)
    && Number.isFinite(value.agreementRate)
    && Number.isFinite(value.badMoveRate)
    && Number.isFinite(value.decisionCount)
    && value.decisionCount > 0
  ));
  const decisionCount = valid.reduce((sum, value) => sum + value.decisionCount, 0);
  if (!decisionCount) return null;
  return {
    rating: valid.reduce((sum, value) => sum + value.rating * value.decisionCount, 0) / decisionCount,
    agreementRate: valid.reduce((sum, value) => sum + value.agreementRate * value.decisionCount, 0) / decisionCount,
    badMoveRate: valid.reduce((sum, value) => sum + value.badMoveRate * value.decisionCount, 0) / decisionCount,
    gameCount: valid.length,
    decisionCount,
  };
}
