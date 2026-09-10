import { describe, expect, it } from "vitest";
import { initialTutorialCaseState, transitionTutorialCase, tutorialReviewerByLogin } from "./tutorial-review";

describe("tutorial review workflow", () => {
  it("accepts account names and Chinese display names", () => {
    expect(tutorialReviewerByLogin("hmx")?.displayName).toBe("何明轩");
    expect(tutorialReviewerByLogin("彭 虹清")?.id).toBe("phq");
    expect(tutorialReviewerByLogin("鄂子懿")?.id).toBe("ezy");
    expect(tutorialReviewerByLogin("wdj")?.displayName).toBe("吴东杰");
    expect(tutorialReviewerByLogin("吴 东杰")?.id).toBe("wdj");
  });

  it("moves an approved case through both review stages", () => {
    const initial = initialTutorialCaseState("SRC-1-E10-S-T07");
    const secondary = transitionTutorialCase(initial, "initial_pass", "hmx", "形状清楚", "2026-09-03T01:00:00.000Z");
    const final = transitionTutorialCase(secondary, "secondary_pass", "phq", "适合第一期", "2026-09-03T02:00:00.000Z");
    expect(final.status).toBe("final");
    expect(final.history.map((event) => event.reviewerId)).toEqual(["hmx", "phq"]);
    expect(final.note).toBe("适合第一期");
  });

  it("rejects an action from the wrong stage", () => {
    expect(() => transitionTutorialCase(
      initialTutorialCaseState("case"),
      "secondary_pass",
      "hmx",
      "",
    )).toThrow("牌例状态已变化");
  });

  it("requires a different reviewer for secondary review", () => {
    const secondary = transitionTutorialCase(initialTutorialCaseState("case"), "initial_pass", "hmx", "");
    expect(() => transitionTutorialCase(secondary, "secondary_pass", "hmx", ""))
      .toThrow("另一位管理员");
    expect(() => transitionTutorialCase(secondary, "secondary_reject", "hmx", ""))
      .toThrow("另一位管理员");
  });
});
