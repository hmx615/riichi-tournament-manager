export function finalRawPointsFromHands(hands: unknown[][], sourceLabel: string) {
  const lastHand = hands[hands.length - 1];
  const initial = lastHand?.[1];
  if (!Array.isArray(initial) || initial.length !== 4 || !initial.every((point) => Number.isFinite(Number(point)))) {
    throw new Error(`${sourceLabel}缺少终局点数`);
  }
  const points = initial.map(Number);
  let riichiDeclarations = 0;

  // Tenhou /6 result deltas award riichi sticks, but do not include the
  // 1,000-point declaration payment made during the final hand.
  for (let seat = 0; seat < 4; seat += 1) {
    const discards = lastHand[6 + seat * 3];
    if (Array.isArray(discards) && discards.some((tile) => typeof tile === "string" && tile.startsWith("r"))) {
      points[seat] -= 1000;
      riichiDeclarations += 1;
    }
  }
  const results = lastHand.slice(16);
  for (const result of results) {
    if (!Array.isArray(result) || !Array.isArray(result[1])) continue;
    for (let seat = 0; seat < 4; seat += 1) points[seat] += Number(result[1][seat] || 0);
  }
  if (!results.some((result) => Array.isArray(result) && result[0] === "和了")) {
    const round = lastHand[0];
    const carriedRiichiSticks = Array.isArray(round) && Number.isFinite(Number(round[2])) ? Number(round[2]) : 0;
    const unclaimedRiichiPoints = (carriedRiichiSticks + riichiDeclarations) * 1000;
    if (unclaimedRiichiPoints > 0) {
      const leader = [0, 1, 2, 3].sort((left, right) => points[right] - points[left] || left - right)[0];
      points[leader] += unclaimedRiichiPoints;
    }
  }
  if (!points.every(Number.isFinite)) throw new Error(`${sourceLabel}的终局点数无效`);
  return points;
}

export function resultScoresFromRawPoints(value: unknown, rawPoints: number[]) {
  if (Array.isArray(value) && value.length === 4 && value.every((point) => Number.isFinite(Number(point)))) {
    return value.map(Number);
  }
  const order = [0, 1, 2, 3].sort((left, right) => rawPoints[right] - rawPoints[left] || left - right);
  const scores = Array(4).fill(0);
  order.forEach((seat, index) => { scores[seat] = 4 - index; });
  return scores;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function semanticHands(hands: unknown[][]) {
  return hands.map((hand) => [
    ...hand.slice(0, 16),
    ...hand.slice(16).map((result) => {
      if (!Array.isArray(result)) return result;
      const detail = result[2];
      return [
        result[0],
        result[1],
        Array.isArray(detail) ? detail.slice(0, 3) : detail,
      ];
    }),
  ]);
}

export async function matchContentFingerprint(hands: unknown[][]) {
  return (await sha256Hex(JSON.stringify(semanticHands(hands)))).slice(0, 32);
}
