import type { Person } from "@/domain/types";
import { personTags } from "@/domain/person-tags";

export function PersonTags({ person, compact = false }: { person: Person; compact?: boolean }) {
  const tags = personTags(person);
  if (!tags.length) return null;
  return <div className={`person-tags${compact ? " compact" : ""}`} aria-label="人物标签">
    {tags.map((tag) => <span key={tag}>{tag}</span>)}
  </div>;
}
