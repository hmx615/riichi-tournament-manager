import { describe, expect, it } from "vitest";
import { decodePersonId, isValidPersonId, personIdError } from "./person-id";

describe("person IDs", () => {
  it("allows normal Unicode and punctuation characters", () => {
    expect(isValidPersonId("明轩_01")).toBe(true);
    expect(isValidPersonId("Alice Smith")).toBe(true);
    expect(personIdError("明轩_01")).toBeNull();
  });

  it("rejects characters that would break routing or storage", () => {
    expect(personIdError("明/轩")).toBe("人物 ID 不能包含斜杠");
    expect(personIdError("..")).toBe("人物 ID 不能使用路径保留名称");
    expect(personIdError("a\n b")).toBe("人物 ID 不能包含控制字符");
  });

  it("decodes route parameters consistently", () => {
    expect(decodePersonId("%E5%A3%AB%E5%BC%BA")).toBe("士强");
    expect(decodePersonId("士强")).toBe("士强");
    expect(decodePersonId("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
