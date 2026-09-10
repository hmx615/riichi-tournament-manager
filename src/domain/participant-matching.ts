import type { Competition, Person, PersonAccount } from "./types";

export function isNagaName(name: string) {
  return /naga/i.test(name);
}

export function inferParticipantId(
  competition: Competition,
  username: string,
  people: Person[],
  platform: PersonAccount["platform"] | null,
): string | null {
  const personById = new Map(people.map((person) => [person.id, person]));
  const participants = competition.participants;
  const accounts = platform ? participants.filter((participant) =>
    personById.get(participant.personId || "")?.accounts.some((account) => account.platform === platform && account.username === username),
  ) : [];
  if (accounts.length) return accounts.length === 1 ? accounts[0].id : null;
  const exact = participants.filter((participant) => participant.usernames.includes(username));
  if (exact.length) return exact.length === 1 ? exact[0].id : null;
  if (isNagaName(username)) {
    const naga = participants.filter((participant) =>
      isNagaName(participant.displayName) || isNagaName(personById.get(participant.personId || "")?.displayName || ""),
    );
    return naga.length === 1 ? naga[0].id : null;
  }
  const mortal = participants.filter((participant) =>
    username === "NoName" && (participant.personId === "mortal" || participant.id.toLowerCase() === "mortal"),
  );
  return mortal.length === 1 ? mortal[0].id : null;
}
