import { describe, expect, it } from "vitest";
import type { NegotiationAccessGuard } from "./types";
import {
  accessCodeLockedUntil,
  generateAccessCode,
  hashAccessCode,
  isValidAccessCodeFormat,
  registerFailedAttempt,
  remainingAttempts,
  verifyAccessCode,
} from "./negotiation-access";

const secret = "test-secret-at-least-32-characters-long";

describe("negotiation access code", () => {
  it("generates eight digit codes including leading zeros", () => {
    expect(generateAccessCode(new Uint32Array([12345678]))).toBe("12345678");
    expect(generateAccessCode(new Uint32Array([42]))).toBe("00000042");
    expect(generateAccessCode(new Uint32Array([199999999]))).toBe("99999999");
  });

  it("accepts only eight digits", () => {
    expect(isValidAccessCodeFormat("12345678")).toBe(true);
    expect(isValidAccessCodeFormat(" 87654321 ")).toBe(true);
    expect(isValidAccessCodeFormat("1234567")).toBe(false);
    expect(isValidAccessCodeFormat("123456789")).toBe(false);
    expect(isValidAccessCodeFormat("abcdef")).toBe(false);
  });

  it("verifies the right code and rejects wrong ones", async () => {
    const hash = await hashAccessCode(secret, "00074211");
    expect(hash.startsWith("hmac-sha256$")).toBe(true);
    expect(await verifyAccessCode(secret, "00074211", hash)).toBe(true);
    expect(await verifyAccessCode(secret, "00074212", hash)).toBe(false);
    expect(await verifyAccessCode("another-secret-at-least-32-chars", "00074211", hash)).toBe(false);
    expect(await verifyAccessCode(secret, "7421", hash)).toBe(false);
  });

  it("locks the code after five wrong attempts and clears the counter after locking", () => {
    let entry: NegotiationAccessGuard = { failedAttempts: 0 };
    const at = new Date("2026-09-16T10:00:00.000Z");
    for (let attempt = 1; attempt < 5; attempt += 1) {
      entry = registerFailedAttempt(entry, at);
      expect(remainingAttempts(entry)).toBe(5 - attempt);
      expect(accessCodeLockedUntil(entry, at.getTime())).toBe(0);
    }
    entry = registerFailedAttempt(entry, at);
    expect(entry.failedAttempts).toBe(0);
    expect(accessCodeLockedUntil(entry, at.getTime())).toBe(Date.parse("2026-09-16T10:10:00.000Z"));
    expect(accessCodeLockedUntil(entry, Date.parse("2026-09-16T10:11:00.000Z"))).toBe(0);
  });
});
