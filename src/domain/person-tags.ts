import type { Person } from "@/domain/types";

export const DEFAULT_PERSON_TAG = "国企办公厅";

/** 只读标签时需要的最小人物字段，人物池、排行榜等轻量调用方不必构造完整 Person。 */
export type PersonTagSource = Pick<Person, "kind" | "tags">;

export function normalizePersonTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function personTags(person: PersonTagSource) {
  if (person.tags) return normalizePersonTags(person.tags);
  return person.kind === "human" ? [DEFAULT_PERSON_TAG] : [];
}
