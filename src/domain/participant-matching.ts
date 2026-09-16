import type { Competition, Participant, Person, PersonAccount } from "./types";

export function isNagaName(name: string) {
  return /naga/i.test(name);
}

/**
 * 所有可能对应这个平台昵称的参赛选手。
 *
 * 顺序即优先级：先看人物档案里登记的账号，再看赛事里遗留的昵称表，最后是 NAGA / Mortal 这类特殊昵称。
 * 返回多个结果意味着这个昵称被多名选手共用（例如「東海大黄魚」同时登记在何明轩与赵得華名下）。
 */
export function participantCandidates(
  competition: Competition,
  username: string,
  people: Person[],
  platform: PersonAccount["platform"] | null,
): string[] {
  const personById = new Map(people.map((person) => [person.id, person]));
  const participants = competition.participants;
  const ids = (list: Participant[]) => [...new Set(list.map((participant) => participant.id))];
  const accounts = platform ? participants.filter((participant) =>
    personById.get(participant.personId || "")?.accounts.some((account) => account.platform === platform && account.username === username),
  ) : [];
  if (accounts.length) return ids(accounts);
  const exact = participants.filter((participant) => participant.usernames.includes(username));
  if (exact.length) return ids(exact);
  if (isNagaName(username)) {
    return ids(participants.filter((participant) =>
      isNagaName(participant.displayName) || isNagaName(personById.get(participant.personId || "")?.displayName || ""),
    ));
  }
  if (username === "NoName") {
    return ids(participants.filter((participant) => participant.personId === "mortal" || participant.id.toLowerCase() === "mortal"));
  }
  return [];
}

/** 昵称只对应唯一选手时才自动匹配，否则交给人工确认。 */
export function inferParticipantId(
  competition: Competition,
  username: string,
  people: Person[],
  platform: PersonAccount["platform"] | null,
): string | null {
  const candidates = participantCandidates(competition, username, people, platform);
  return candidates.length === 1 ? candidates[0] : null;
}

export type SeatMatch = {
  participantId: string | null;
  /** 该座次单看昵称是共用账号，靠同桌去重（同一人不可能占两个座次）才定下来。 */
  resolvedByTable: boolean;
  /** 同桌去重之后仍有歧义，按下面的共用账号偏好规则定下来（可在确认页手动改）。 */
  resolvedByPreference: boolean;
};

/**
 * 共用账号偏好规则：昵称被多人登记时，如果 anchor 与 owner 同时出现在这一桌，
 * 就认为该昵称是 owner 在用（anchor 用他自己的另一个昵称占座）。
 *
 * - 「東海大黄魚」登记在何明轩与赵得華名下：何明轩与赵得華同桌时，大黄鱼算赵得華在用。
 * - 「風蛍月」登记在何明轩与彭虹清名下：何明轩与彭虹清同桌时，风蛍月算彭虹清在用。
 */
const sharedAccountPreferences = [
  { username: "東海大黄魚", anchor: "hmx", owner: "Zhao_dehua" },
  { username: "風蛍月", anchor: "hmx", owner: "xiaop" },
];

/**
 * 把一桌四家的昵称放在一起匹配：
 *
 * 1. 每个昵称先各自列出候选选手；
 * 2. 要求同一名人类选手只占一个座次（AI 允许重复，例如两桌 NAGA）；
 * 3. 只有当某座次在所有可行组合里都指向同一人时才自动填，仍然有歧义的座次留空让人工确认。
 * 4. 同桌去重后仍判不出的座次，再套用共用账号偏好规则。
 *
 * 例：桌上同时出现「猫妥」（何明轩/彭虹清共用）与「東海大黄魚」（何明轩/赵得華共用）时，
 * 若赛程已限定这一桌只有何明轩与赵得華，则「猫妥」只能为何明轩，于是「東海大黄魚」判定为赵得華。
 */
export function resolveTableParticipants(
  competition: Competition,
  usernames: string[],
  people: Person[],
  platform: PersonAccount["platform"] | null,
): SeatMatch[] {
  const participantById = new Map(competition.participants.map((participant) => [participant.id, participant]));
  const candidateSets = usernames.map((username) => participantCandidates(competition, username, people, platform));
  const identityOf = (participantId: string) => {
    const participant = participantById.get(participantId);
    return participant?.personId ? `person:${participant.personId}` : `participant:${participantId}`;
  };
  const reusable = (participantId: string) => participantById.get(participantId)?.kind === "ai";

  /** 在已固定若干座次的前提下，判断让 fixedSeat 坐 fixedId 是否还存在可行分配。 */
  const feasible = (pinned: Map<number, string>, fixedSeat: number | null, fixedId: string | null) => {
    const used = new Map<string, number>();
    const claim = (participantId: string) => {
      const key = identityOf(participantId);
      used.set(key, (used.get(key) ?? 0) + 1);
    };
    const release = (participantId: string) => {
      const key = identityOf(participantId);
      const next = (used.get(key) ?? 0) - 1;
      if (next > 0) used.set(key, next); else used.delete(key);
    };
    const blocked = (participantId: string) => !reusable(participantId) && (used.get(identityOf(participantId)) ?? 0) > 0;
    for (const [seat, participantId] of pinned) {
      if (seat === fixedSeat) continue;
      if (blocked(participantId)) return false;
      claim(participantId);
    }
    if (fixedId) {
      if (blocked(fixedId)) return false;
      claim(fixedId);
    }
    const order = candidateSets.map((_, seat) => seat).filter((seat) => seat !== fixedSeat)
      .filter((seat) => !pinned.has(seat))
      .sort((left, right) => candidateSets[left].length - candidateSets[right].length);
    const assign = (index: number): boolean => {
      if (index === order.length) return true;
      const candidates = candidateSets[order[index]];
      if (!candidates.length) return assign(index + 1);
      for (const participantId of candidates) {
        if (blocked(participantId)) continue;
        claim(participantId);
        if (assign(index + 1)) return true;
        release(participantId);
      }
      return false;
    };
    return assign(0);
  };

  /** 在固定座次之外，只保留所有可行组合都同意的那些座次。 */
  const solve = (pinned: Map<number, string>) => candidateSets.map((candidates, seat) => {
    const pinnedId = pinned.get(seat);
    if (pinnedId) return pinnedId;
    if (!candidates.length) return null;
    const feasibleIds = candidates.filter((participantId) => feasible(pinned, seat, participantId));
    return feasibleIds.length === 1 ? feasibleIds[0] : null;
  });

  const strict = solve(new Map());
  const pinned = new Map<number, string>();
  strict.forEach((participantId, seat) => { if (participantId) pinned.set(seat, participantId); });

  // 「在同桌」的判定：赛程名单就是这一桌时，名单里的人都在场；否则只有本桌其他座次已经定下来的人才算在场。
  const rosterIsTable = competition.participants.length === usernames.length;
  const present = new Set<string>();
  if (rosterIsTable) {
    for (const participant of competition.participants) if (participant.personId) present.add(participant.personId);
  }
  for (const participantId of pinned.values()) {
    const personId = participantById.get(participantId)?.personId;
    if (personId) present.add(personId);
  }

  const participantByPersonId = new Map(competition.participants.flatMap((participant) =>
    participant.personId ? [[participant.personId, participant] as const] : [],
  ));
  for (const rule of sharedAccountPreferences) {
    if (!present.has(rule.anchor) || !present.has(rule.owner)) continue;
    const owner = participantByPersonId.get(rule.owner);
    const anchor = participantByPersonId.get(rule.anchor);
    if (!owner || !anchor) continue;
    usernames.forEach((username, seat) => {
      if (pinned.has(seat) || username.trim() !== rule.username) return;
      const candidates = candidateSets[seat];
      if (!candidates.includes(owner.id) || !candidates.includes(anchor.id)) return;
      if (feasible(pinned, seat, owner.id)) pinned.set(seat, owner.id);
    });
  }

  const resolved = solve(pinned);
  return candidateSets.map((candidates, seat) => ({
    participantId: resolved[seat],
    resolvedByTable: Boolean(strict[seat]) && candidates.length > 1,
    resolvedByPreference: !strict[seat] && Boolean(resolved[seat]),
  }));
}
