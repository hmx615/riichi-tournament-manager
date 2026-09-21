import { z } from "zod";
import { majsoulRanks } from "./majsoul-rank";

export const mahjongRanks = [
  "新手",
  ...majsoulRanks,
  "其他 / 暂未定级",
] as const;

export const clubRegistrationSchema = z.object({
  studentId: z.string().trim()
    .min(4, "请填写有效学号")
    .max(32, "学号最多 32 个字符")
    .regex(/^[A-Za-z0-9_-]+$/, "学号只能包含字母、数字、下划线或连字符"),
  nickname: z.string().trim().min(1, "请填写网名").max(30, "网名最多 30 个字符"),
  qq: z.string().trim().regex(/^\d{5,12}$/, "请填写 5–12 位 QQ 号"),
  otherPlatformRank: z.string().trim().min(1, "请填写其他平台最高段位，没有请填“无”").max(80, "其他平台段位最多 80 个字符"),
  majsoulNickname: z.string().trim().min(1, "请填写雀魂游戏昵称").max(40, "雀魂游戏昵称最多 40 个字符"),
  majsoulId: z.string().trim().min(2, "请填写有效的雀魂 ID").max(40, "雀魂 ID 最多 40 个字符"),
  currentRank: z.enum(mahjongRanks, { message: "请选择当前段位" }),
  goals: z.string().trim().min(5, "请简要说明想获得的资源或提高方向").max(1000, "此项最多 1000 个字符"),
  ownsMajsoulAccount: z.literal("on", { message: "请确认填写的是本人雀魂账号" }),
  privacyConsent: z.literal("on", { message: "请同意信息使用说明后再提交" }),
});

export type ClubRegistrationInput = z.infer<typeof clubRegistrationSchema>;

export type ClubRegistration = Omit<ClubRegistrationInput, "ownsMajsoulAccount" | "privacyConsent"> & {
  id: string;
  ownsMajsoulAccount: true;
  privacyConsent: true;
  createdAt: string;
};

export function registrationValues(formData: FormData) {
  return {
    studentId: formData.get("studentId"),
    nickname: formData.get("nickname"),
    qq: formData.get("qq"),
    otherPlatformRank: formData.get("otherPlatformRank"),
    majsoulNickname: formData.get("majsoulNickname"),
    majsoulId: formData.get("majsoulId"),
    currentRank: formData.get("currentRank"),
    goals: formData.get("goals"),
    ownsMajsoulAccount: formData.get("ownsMajsoulAccount"),
    privacyConsent: formData.get("privacyConsent"),
  };
}

export function firstRegistrationError(error: z.ZodError) {
  return error.issues[0]?.message || "请检查填写内容";
}
