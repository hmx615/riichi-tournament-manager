export type SeatNagaRating = {
  seat: 0 | 1 | 2 | 3;
  model: string;
  rating: number;
  agreementRate: number;
  badMoveRate: number;
  decisionCount: number;
};

const honorIndexes: Record<string, number> = { E: 27, S: 28, W: 29, N: 30, P: 31, F: 32, C: 33 };

function tileIndex(tile: string) {
  if (tile in honorIndexes) return honorIndexes[tile];
  const match = tile.match(/^([1-9])([mps])r?$/);
  if (!match) return null;
  const suitOffset = { m: 0, p: 9, s: 18 }[match[2] as "m" | "p" | "s"];
  return suitOffset + Number(match[1]) - 1;
}

function finiteNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(Number);
  return values.length === 34 && values.every(Number.isFinite) ? values : null;
}

export function calculateNagaRatings(report: unknown): SeatNagaRating[] {
  if (!report || typeof report !== "object") throw new Error("NAGA 报告格式无效");
  const value = report as { pred?: unknown; naga_types?: unknown };
  if (!Array.isArray(value.pred) || !value.naga_types || typeof value.naga_types !== "object") {
    throw new Error("NAGA 报告缺少 Rating 数据");
  }

  const models = Object.entries(value.naga_types as Record<string, unknown>)
    .filter(([key, name]) => /^\d+$/.test(key) && typeof name === "string")
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([key, name]) => ({ index: Number(key), name: name as string }));
  if (!models.length) throw new Error("NAGA 报告缺少分析模型");

  const stats = Array.from({ length: 4 }, () => models.map(() => ({ decisions: 0, same: 0, badMoves: 0, difference: 0 })));
  for (const hand of value.pred) {
    if (!Array.isArray(hand)) continue;
    for (const rawTurn of hand) {
      if (!rawTurn || typeof rawTurn !== "object") continue;
      const turn = rawTurn as { dahai_pred?: unknown; info?: { msg?: { actor?: unknown; real_dahai?: unknown } } };
      if (!Array.isArray(turn.dahai_pred)) continue;
      const actor = Number(turn.info?.msg?.actor);
      const realTile = turn.info?.msg?.real_dahai;
      const real = typeof realTile === "string" ? tileIndex(realTile) : null;
      if (!Number.isInteger(actor) || actor < 0 || actor > 3 || real == null) continue;

      const firstPrediction = finiteNumbers(turn.dahai_pred[models[0].index]);
      if (!firstPrediction || firstPrediction.reduce((sum, item) => sum + item, 0) === 0) continue;
      for (let modelPosition = 0; modelPosition < models.length; modelPosition += 1) {
        const prediction = finiteNumbers(turn.dahai_pred[models[modelPosition].index]);
        if (!prediction) continue;
        const total = prediction.reduce((sum, item) => sum + item, 0);
        if (total === 0) continue;
        const best = Math.max(...prediction);
        const modelStats = stats[actor][modelPosition];
        modelStats.decisions += 1;
        modelStats.same += Number(prediction.indexOf(best) === real);
        modelStats.badMoves += Number(prediction[real] / total < 0.05);
        modelStats.difference += Math.abs(prediction[real] / total - best / total);
      }
    }
  }

  return stats.flatMap((seatStats, seat) => seatStats.flatMap((modelStats, modelPosition) => {
    if (!modelStats.decisions) return [];
    const rating = modelStats.same === 0
      ? 0
      : (modelStats.decisions - modelStats.difference) / modelStats.decisions * 100;
    return [{
      seat: seat as 0 | 1 | 2 | 3,
      model: models[modelPosition].name,
      rating: Number(rating.toFixed(3)),
      agreementRate: Number((modelStats.same / modelStats.decisions).toFixed(4)),
      badMoveRate: Number((modelStats.badMoves / modelStats.decisions).toFixed(4)),
      decisionCount: modelStats.decisions,
    }];
  }));
}
