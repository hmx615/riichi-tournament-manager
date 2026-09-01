import { describe, expect, it } from "vitest";
import { createAdminSessionToken, hashAdminPassword, verifyAdminPassword, verifyAdminSessionToken } from "./admin-auth";

describe("admin authentication", () => {
  it("hashes and verifies passwords without storing plaintext", async () => {
    const pepper = "a-separate-server-side-secret";
    const hash = await hashAdminPassword("correct horse battery staple", pepper, new Uint8Array(16).fill(7));
    expect(hash).not.toContain("correct horse battery staple");
    await expect(verifyAdminPassword("correct horse battery staple", hash, pepper)).resolves.toBe(true);
    await expect(verifyAdminPassword("wrong password", hash, pepper)).resolves.toBe(false);
    await expect(verifyAdminPassword("correct horse battery staple", hash, "wrong-secret")).resolves.toBe(false);
  });

  it("accepts valid sessions and rejects expired or modified sessions", async () => {
    const now = 1_800_000_000_000;
    const token = await createAdminSessionToken("a-secure-test-secret", now + 60_000);
    await expect(verifyAdminSessionToken(token, "a-secure-test-secret", now)).resolves.toBe(true);
    await expect(verifyAdminSessionToken(token, "a-secure-test-secret", now + 60_001)).resolves.toBe(false);
    await expect(verifyAdminSessionToken(`${token}x`, "a-secure-test-secret", now)).resolves.toBe(false);
    await expect(verifyAdminSessionToken(token, "another-secret", now)).resolves.toBe(false);
  });
});
