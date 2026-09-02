import type { Person } from "@/domain/types";

export function hasDuplicateHumanParticipants(personIds: string[], people: Person[]) {
  const kindById = new Map(people.map((person) => [person.id, person.kind]));
  const humanIds = personIds.filter((personId) => kindById.get(personId) === "human");
  return new Set(humanIds).size !== humanIds.length;
}
