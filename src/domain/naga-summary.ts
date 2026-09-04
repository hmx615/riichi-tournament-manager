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

function validMetrics(values: NagaMetricInput[]) {
  return values.filter((value) => (
    Number.isFinite(value.rating)
    && Number.isFinite(value.agreementRate)
    && Number.isFinite(value.badMoveRate)
    && Number.isFinite(value.decisionCount)
    && value.decisionCount > 0
  ));
}

export function summarizeNagaMetrics(values: NagaMetricInput[]): NagaMetricSummary | null {
  const valid = validMetrics(values);
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

export function summarizeNagaMetricsByUnit(values: NagaMetricInput[]): NagaMetricSummary | null {
  const valid = validMetrics(values);
  if (!valid.length) return null;
  return {
    rating: valid.reduce((sum, value) => sum + value.rating, 0) / valid.length,
    agreementRate: valid.reduce((sum, value) => sum + value.agreementRate, 0) / valid.length,
    badMoveRate: valid.reduce((sum, value) => sum + value.badMoveRate, 0) / valid.length,
    gameCount: valid.length,
    decisionCount: valid.reduce((sum, value) => sum + value.decisionCount, 0),
  };
}
