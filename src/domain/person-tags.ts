import type { Person } from "@/domain/types";

export const DEFAULT_PERSON_TAG = "国企办公厅";

export function normalizePersonTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function personTags(person: Person) {
  if (person.tags) return normalizePersonTags(person.tags);
  return person.kind === "human" ? [DEFAULT_PERSON_TAG] : [];
}
