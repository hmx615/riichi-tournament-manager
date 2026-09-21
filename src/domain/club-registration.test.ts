import { describe, expect, it } from "vitest";
import { clubRegistrationSchema } from "./club-registration";

const validRegistration = {
  studentId: "20260001",
  nickname: "一向听",
  qq: "123456789",
  otherPlatformRank: "天凤七段",
  majsoulNickname: "MahjongPlayer",
  majsoulId: "123456789",
  currentRank: "雀豪1",
  goals: "希望提高牌效和防守判断",
  ownsMajsoulAccount: "on",
  privacyConsent: "on",
};

describe("club registration validation", () => {
  it("接受完整报名信息", () => {
    expect(clubRegistrationSchema.safeParse(validRegistration).success).toBe(true);
  });

  it("保留学号和 QQ 的字符串形式", () => {
    const parsed = clubRegistrationSchema.parse({ ...validRegistration, studentId: "00123456", qq: "012345678" });
    expect(parsed.studentId).toBe("00123456");
    expect(parsed.qq).toBe("012345678");
  });

  it("拒绝未确认本人账号或信息使用说明的提交", () => {
    expect(clubRegistrationSchema.safeParse({ ...validRegistration, ownsMajsoulAccount: null }).success).toBe(false);
    expect(clubRegistrationSchema.safeParse({ ...validRegistration, privacyConsent: null }).success).toBe(false);
  });

  it("要求其他平台段位和雀魂游戏昵称", () => {
    expect(clubRegistrationSchema.safeParse({ ...validRegistration, otherPlatformRank: "" }).success).toBe(false);
    expect(clubRegistrationSchema.safeParse({ ...validRegistration, majsoulNickname: "" }).success).toBe(false);
  });
});
