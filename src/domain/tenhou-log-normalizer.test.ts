import { describe, expect, it } from "vitest";
import { matchContentFingerprint } from "./tenhou-log-normalizer";

function handWithYakuLabel(label: string) {
  return [
    [0, 0, 0], [25000, 25000, 25000, 25000], [11], [],
    [], [], [], [], [], [], [], [], [], [], [], [],
    ["和了", [2100, -2100, 0, 0], [0, 1, 0, "30符1飜1500点", label]],
  ];
}

describe("match content fingerprint", () => {
  it("ignores localized score and yaku descriptions", async () => {
    const naga = [handWithYakuLabel("自風 東(1飜)")];
    const majsoul = [handWithYakuLabel("役牌:自風牌(1飜)")];
    (majsoul[0][16] as unknown[])[2] = [0, 1, 0, "different score label", "役牌:自風牌(1飜)"];

    await expect(matchContentFingerprint(naga)).resolves.toBe(await matchContentFingerprint(majsoul));
  });

  it("changes when gameplay or result points change", async () => {
    const original = [handWithYakuLabel("自風 東(1飜)")];
    const changed = structuredClone(original);
    (changed[0][16] as unknown[])[1] = [3900, -3900, 0, 0];

    expect(await matchContentFingerprint(original)).not.toBe(await matchContentFingerprint(changed));
  });
});
