export function ranksFromRawPoints(rawPoints: number[]): Array<1 | 2 | 3 | 4> {
  if (rawPoints.length !== 4) throw new Error("一场对局必须有四名选手");
  const order = [0, 1, 2, 3].sort((a, b) => rawPoints[b] - rawPoints[a] || a - b);
  const ranks = Array<1 | 2 | 3 | 4>(4);
  order.forEach((seat, index) => {
    ranks[seat] = (index + 1) as 1 | 2 | 3 | 4;
  });
  return ranks;
}

export function calculateCompetitionPoints(
  rawPoints: number[],
  initialPoints: number,
  rankPoints: [number, number, number, number],
): number[] {
  const ranks = ranksFromRawPoints(rawPoints);
  return rawPoints.map((points, seat) =>
    Number((((points - initialPoints) / 1000) + rankPoints[ranks[seat] - 1]).toFixed(1)),
  );
}
