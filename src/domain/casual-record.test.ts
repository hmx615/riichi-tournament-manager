import { describe, expect, it } from "vitest";
import {
  casualGuestNameMaxLength,
  casualRecordHasNaga,
  casualRecordIncludesPerson,
  casualSeatError,
  type CasualRecord,
} from "./casual-record";

const seat = (personId: string | null, guestName: string | null = null) => ({ personId, guestName });

describe("散排座次校验", () => {
  it("四家齐了才合法", () => {
    expect(casualSeatError([seat("a"), seat("b"), seat("c"), seat("d")])).toBeNull();
    expect(casualSeatError([seat("a"), seat("b"), seat("c")])).toBe("散排牌谱必须正好四家");
  });

  it("允许排位对手（人物池外的昵称）", () => {
    expect(casualSeatError([seat("a"), seat("b"), seat(null, "路人甲"), seat(null, "路人乙")])).toBeNull();
    expect(casualSeatError([seat("a"), seat("b"), seat(null, "  "), seat(null, "路人乙")])).toContain("还没有填写");
  });

  it("同一人物不能重复占座", () => {
    expect(casualSeatError([seat("a"), seat("a"), seat("c"), seat("d")])).toBe("同一人物不能在散排里占两个座次");
  });

  it("选手账号必须把自己放进四家", () => {
    expect(casualSeatError([seat("a"), seat("b"), seat("c"), seat("d")], { requiredPersonId: "c" })).toBeNull();
    expect(casualSeatError([seat("a"), seat("b"), seat("c"), seat("d")], { requiredPersonId: "z" }))
      .toBe("只能录入包含你自己的散排牌谱");
  });

  it("选手账号不能把排位对手登记成其他站内人物", () => {
    expect(casualSeatError(
      [seat("self"), seat("other"), seat(null, "c"), seat(null, "d")],
      { requiredPersonId: "self", allowedPersonIds: ["self"] },
    )).toBe("第 2 家选择了不可用的人物");
  });

  it("路人昵称有长度上限", () => {
    expect(casualSeatError([seat("a"), seat("b"), seat("c"), seat(null, "あ".repeat(casualGuestNameMaxLength + 1))])).toContain("不能超过");
  });
});

describe("散排记录辅助逻辑", () => {
  const record = {
    seats: [seat("a"), seat("b"), seat(null, "路人"), seat("d")],
    nagaUrl: null,
    nagaRatings: [],
  } as unknown as CasualRecord;

  it("能判断记录是否包含某个人物", () => {
    expect(casualRecordIncludesPerson(record, "a")).toBe(true);
    expect(casualRecordIncludesPerson(record, "z")).toBe(false);
  });

  it("只有带 NAGA 评分的记录才算含 NAGA", () => {
    expect(casualRecordHasNaga(record)).toBe(false);
    expect(casualRecordHasNaga({ ...record, nagaUrl: "https://ricochet.cn/x", nagaRatings: [{ seat: 0, model: "ニシキ", rating: 9, agreementRate: 0.8, badMoveRate: 0.1, decisionCount: 100 }] } as CasualRecord)).toBe(true);
  });
});
