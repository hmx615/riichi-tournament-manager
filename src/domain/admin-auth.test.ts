import { describe, expect, it } from "vitest";
import { createAdminSessionToken, hashAdminPassword, verifyAdminPassword, verifyAdminSessionToken } from "./admin-auth";

describe("admin authentication", () => {
  it("hashes and verifies passwords without storing plaintext", async () => {
    const hash = await hashAdminPassword("correct horse battery staple", Buffer.alloc(16, 7));
    expect(hash).not.toContain("correct horse battery staple");
    await expect(verifyAdminPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyAdminPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("accepts valid sessions and rejects expired or modified sessions", () => {
    const now = 1_800_000_000_000;
    const token = createAdminSessionToken("a-secure-test-secret", now + 60_000);
    expect(verifyAdminSessionToken(token, "a-secure-test-secret", now)).toBe(true);
    expect(verifyAdminSessionToken(token, "a-secure-test-secret", now + 60_001)).toBe(false);
    expect(verifyAdminSessionToken(`${token}x`, "a-secure-test-secret", now)).toBe(false);
    expect(verifyAdminSessionToken(token, "another-secret", now)).toBe(false);
  });
});
