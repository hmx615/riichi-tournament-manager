import { describe, expect, it } from "vitest";
import { assessMatchLevel } from "./match-level";

describe("match level", () => {
  it("classifies matches by the average of four estimated ranks", () => {
    expect(assessMatchLevel([9, 9, 5, 5])).toEqual({ level: "phoenix", averageRank: 7 });
    expect(assessMatchLevel([8.5, 8.5, 8.5, 8.5])?.level).toBe("top");
    expect(assessMatchLevel([7, 7, 7, 7])?.level).toBe("phoenix");
    expect(assessMatchLevel([4, 4, 4, 4])?.level).toBe("tokujou");
    expect(assessMatchLevel([3.9, 3.9, 3.9, 3.9])?.level).toBe("horse");
  });

  it("counts fixed 10+ AI ranks as 10 and requires four known ranks", () => {
    expect(assessMatchLevel(["10+", 9, 8, 7])).toEqual({ level: "top", averageRank: 8.5 });
    expect(assessMatchLevel([9, 8, 7, null])).toBeNull();
  });
});
