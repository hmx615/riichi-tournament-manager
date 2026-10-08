import { describe, expect, it } from "vitest";
import {
  appUserPasswordIterations,
  createAppUserSchema,
  generateAppUserPassword,
  hashAppUserPassword,
  normalizeUsername,
  verifyAppUserPassword,
} from "./app-user";

describe("选手账号密码", () => {
  it("加盐哈希后可以校验通过，错误密码不通过", async () => {
    const encoded = await hashAppUserPassword("Abcd2345xy");
    expect(encoded.startsWith(`pbkdf2-sha256$${appUserPasswordIterations}$`)).toBe(true);
    await expect(verifyAppUserPassword("Abcd2345xy", encoded)).resolves.toBe(true);
    await expect(verifyAppUserPassword("Abcd2345xz", encoded)).resolves.toBe(false);
  });

  it("同一密码两次哈希结果不同（盐不同）", async () => {
    const first = await hashAppUserPassword("Abcd2345xy");
    const second = await hashAppUserPassword("Abcd2345xy");
    expect(first).not.toBe(second);
    await expect(verifyAppUserPassword("Abcd2345xy", first)).resolves.toBe(true);
    await expect(verifyAppUserPassword("Abcd2345xy", second)).resolves.toBe(true);
  });

  it("不认识或损坏的哈希不会通过", async () => {
    await expect(verifyAppUserPassword("Abcd2345xy", "hmac-sha256$salt$digest")).resolves.toBe(false);
    await expect(verifyAppUserPassword("Abcd2345xy", "pbkdf2-sha256$0$salt$digest")).resolves.toBe(false);
    await expect(verifyAppUserPassword("Abcd2345xy", "")).resolves.toBe(false);
  });

  it("随机密码只使用不易混淆的字符", () => {
    const password = generateAppUserPassword();
    expect(password).toHaveLength(10);
    expect(password).toMatch(/^[a-zA-Z2-9]+$/);
    expect(password).not.toMatch(/[0O1lI]/);
  });

  it("账号统一转小写并做 NFC 归一化", () => {
    expect(normalizeUsername("  PHQ ")).toBe("phq");
    // 「が」用组合形式输入时也要归一化成同一个账号。
    expect(normalizeUsername("が")).toBe(normalizeUsername("か\u3099"));
  });

  it("账号直接用排行榜人物名：中文、日文、两位数都合法", () => {
    for (const name of ["胡米奥", "九条", "乱花", "心脏会闪烁吗", "おでけけ", "3q", "Nanaishi", "Wesley", "紫罗兰梦幻花园"]) {
      expect(createAppUserSchema.safeParse({ username: name, personId: "p", password: "Abcd2345xy" }).success).toBe(true);
    }
  });

  it("拒绝空格、控制字符和路径分隔符", () => {
    for (const name of ["a b", "胡 米", "a/b", "a:b", "a@b", "x\ny", "", "a"]) {
      expect(createAppUserSchema.safeParse({ username: name, personId: "p", password: "Abcd2345xy" }).success).toBe(false);
    }
  });
});
