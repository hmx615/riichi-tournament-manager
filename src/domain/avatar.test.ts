import { describe, expect, it } from "vitest";
import { detectAvatarContentType } from "./avatar";

describe("avatar format detection", () => {
  it("detects JPEG, PNG and WebP by file signature", () => {
    expect(detectAvatarContentType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectAvatarContentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectAvatarContentType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });

  it("rejects content that only claims to be an image", () => {
    expect(detectAvatarContentType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });
});
