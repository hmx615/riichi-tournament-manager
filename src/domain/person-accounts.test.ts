import { describe, expect, it } from "vitest";
import { personAccountBindings } from "./person-accounts";

describe("人物账号绑定", () => {
  const seats = [
    { personId: "中华有为", sourceUsername: "東海大黄魚" },
    { personId: null, sourceUsername: "路人甲" },
    { personId: "越山逐月", sourceUsername: " 風蛍月 " },
  ];

  it("给手工指认过的座次生成账号绑定，忽略路人与空昵称", () => {
    expect(personAccountBindings(seats, "tenhou")).toEqual([
      { personId: "中华有为", account: { platform: "tenhou", username: "東海大黄魚" } },
      { personId: "越山逐月", account: { platform: "tenhou", username: "風蛍月" } },
    ]);
  });

  it("识别不出平台时归入其他账号，仍然记下这个昵称", () => {
    expect(personAccountBindings([seats[0]], null)).toEqual([
      { personId: "中华有为", account: { platform: "other", username: "東海大黄魚" } },
    ]);
  });

  it("同一人物同一账号只保留一条", () => {
    const duplicated = [seats[0], { ...seats[0] }];
    expect(personAccountBindings(duplicated, "tenhou")).toHaveLength(1);
  });
});
