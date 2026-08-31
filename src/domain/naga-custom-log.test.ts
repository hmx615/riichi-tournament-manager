import { describe, expect, it } from "vitest";
import { normalizeNagaCustomLog } from "./naga-custom-log";

function terminalHand() {
  return [
    [7, 0, 0],
    [33000, 10700, 28200, 28100],
    [36],
    [],
    [], [], [],
    [], [], ["r26"],
    [], [], [],
    [], [], [],
    ["和了", [3000, -2000, 0, 0], [0, 1, 0, "30符2飜2000点", "平和(1飜)", "ドラ(1飜)"]],
  ];
}

function terminalDraw() {
  const hand = terminalHand();
  hand[1] = [41400, 2300, 29300, 27000];
  hand[16] = ["流局", [-1000, 3000, -1000, -1000]];
  return hand;
}

describe("NAGA custom haihu", () => {
  it("normalizes a custom report and accounts for the final riichi payment", () => {
    const log = normalizeNagaCustomLog({
      custom_haihu: [JSON.stringify([terminalHand()])],
      player_info: {
        name: ["A", "B", "C", "D"],
        umaoka: [46, -42, 8, -12],
      },
    });

    expect(log.ref).toMatch(/^naga-custom-[a-f0-9]{32}$/);
    expect(log.name).toEqual(["A", "B", "C", "D"]);
    expect(log.sc).toEqual([36000, 46, 7700, -42, 28200, 8, 28100, -12]);
    expect(log.log).toHaveLength(1);
  });

  it("uses a content-stable id independent of JSON whitespace", () => {
    const report = {
      player_info: { name: ["A", "B", "C", "D"], umaoka: [1, 2, 3, 4] },
    };
    const compact = normalizeNagaCustomLog({ ...report, custom_haihu: [JSON.stringify([terminalHand()])] });
    const formatted = normalizeNagaCustomLog({ ...report, custom_haihu: [JSON.stringify([terminalHand()], null, 2)] });
    expect(compact.ref).toBe(formatted.ref);
  });

  it("awards a terminal draw's unclaimed riichi sticks to the final leader", () => {
    const log = normalizeNagaCustomLog({
      custom_haihu: [JSON.stringify([terminalDraw()])],
      player_info: {
        name: ["A", "B", "C", "D"],
        umaoka: [52, -46, 8, -14],
      },
    });

    expect(log.sc).toEqual([41400, 52, 4300, -46, 28300, 8, 26000, -14]);
  });
});
