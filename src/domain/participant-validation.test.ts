import { describe, expect, it } from "vitest";
import type { Person } from "./types";
import { hasDuplicateHumanParticipants } from "./participant-validation";

const people: Person[] = [
  { id: "human-a", displayName: "Human A", kind: "human", color: "#111111", aliases: [], accounts: [] },
  { id: "human-b", displayName: "Human B", kind: "human", color: "#222222", aliases: [], accounts: [] },
  { id: "mortal", displayName: "Mortal", kind: "ai", color: "#333333", aliases: [], accounts: [] },
];

describe("participant person validation", () => {
  it("allows the same AI person in multiple seats", () => {
    expect(hasDuplicateHumanParticipants(["human-a", "mortal", "mortal", "mortal"], people)).toBe(false);
  });

  it("rejects the same human person in multiple seats", () => {
    expect(hasDuplicateHumanParticipants(["human-a", "human-a", "human-b", "mortal"], people)).toBe(true);
  });
});
