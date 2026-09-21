import { describe, expect, it } from "vitest";
import type { Person } from "@/domain/types";
import { DEFAULT_PERSON_TAG, normalizePersonTags, personTags } from "./person-tags";

const person = (kind: Person["kind"], tags?: string[]): Person => ({
  id: kind,
  displayName: kind,
  kind,
  color: "#168f83",
  aliases: [],
  accounts: [],
  ...(tags === undefined ? {} : { tags }),
});

describe("person tags", () => {
  it("places legacy human profiles in the initial organization tag", () => {
    expect(personTags(person("human"))).toEqual([DEFAULT_PERSON_TAG]);
    expect(personTags(person("ai"))).toEqual([]);
  });

  it("normalizes explicit tags without restoring a deliberately empty list", () => {
    expect(normalizePersonTags([" 校外 ", "校外", "联赛选手"])).toEqual(["校外", "联赛选手"]);
    expect(personTags(person("human", []))).toEqual([]);
  });
});
