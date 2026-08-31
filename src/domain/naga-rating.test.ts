import { describe, expect, it } from "vitest";
import { calculateNagaRatings } from "./naga-rating";

describe("calculateNagaRatings", () => {
  it("calculates each model rating by seat using the NAGA formula", () => {
    const first = Array(34).fill(0);
    first[0] = 8000;
    first[1] = 2000;
    const second = Array(34).fill(0);
    second[0] = 6000;
    second[1] = 4000;
    const report = {
      naga_types: { "0": "A", "1": "B" },
      pred: [[
        { info: { msg: { actor: 0, real_dahai: "1m" } }, dahai_pred: [first, second] },
        { info: { msg: { actor: 0, real_dahai: "2m" } }, dahai_pred: [first, second] },
      ]],
    };

    expect(calculateNagaRatings(report)).toEqual([
      { seat: 0, model: "A", rating: 70, agreementRate: 0.5, badMoveRate: 0, decisionCount: 2 },
      { seat: 0, model: "B", rating: 90, agreementRate: 0.5, badMoveRate: 0, decisionCount: 2 },
    ]);
  });

  it("maps red fives to the normal five tile", () => {
    const prediction = Array(34).fill(0);
    prediction[4] = 10000;
    const ratings = calculateNagaRatings({
      naga_types: { "0": "A" },
      pred: [[{ info: { msg: { actor: 2, real_dahai: "5mr" } }, dahai_pred: [prediction] }]],
    });
    expect(ratings).toEqual([{ seat: 2, model: "A", rating: 100, agreementRate: 1, badMoveRate: 0, decisionCount: 1 }]);
  });

  it("counts choices below five percent as bad moves", () => {
    const prediction = Array(34).fill(0);
    prediction[0] = 9600;
    prediction[1] = 400;
    const ratings = calculateNagaRatings({
      naga_types: { "0": "A" },
      pred: [[{ info: { msg: { actor: 1, real_dahai: "2m" } }, dahai_pred: [prediction] }]],
    });
    expect(ratings[0].badMoveRate).toBe(1);
  });
});
