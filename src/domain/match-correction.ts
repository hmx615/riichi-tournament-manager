import type { Competition, MatchCorrection, MatchRecord, NagaRating, SeatAssignment } from "./types";

export type SeatCorrectionInput = {
  /** 按座次 0-3 顺序给出的新身份。 */
  participantIds: string[];
  reason: string;
  at?: string;
};

function humanKey(competition: Competition, participantId: string) {
  const participant = competition.participants.find((item) => item.id === participantId);
  if (!participant || participant.kind !== "human") return null;
  return participant.personId || participant.id;
}

/** NAGA Rating 属于座次：身份改了，Rating 要跟着座次换到新的身份上。 */
function reseatRatings(ratings: NagaRating[] | undefined, seats: SeatAssignment[], corrected: SeatAssignment[]) {
  if (!ratings?.length) return ratings;
  const seatOfParticipant = new Map(seats.map((seat) => [seat.participantId, seat.seat]));
  return ratings.map((rating) => {
    const seat = seatOfParticipant.get(rating.participantId);
    const next = seat === undefined ? undefined : corrected.find((item) => item.seat === seat)?.participantId;
    return next && next !== rating.participantId ? { ...rating, participantId: next } : rating;
  });
}

/**
 * 逐场人工修正身份：原始昵称、原始点数、顺位与比赛积分都不变，只改身份归属，
 * 并追加一条带原因的审计记录。
 */
export function correctMatchSeats(competition: Competition, match: MatchRecord, input: SeatCorrectionInput): MatchRecord {
  const reason = input.reason.trim();
  if (!reason) throw new Error("请填写修改原因");
  if (input.participantIds.length !== 4) throw new Error("必须为四个座次各指定一名选手");
  const participantById = new Map(competition.participants.map((participant) => [participant.id, participant]));
  for (const participantId of input.participantIds) {
    if (!participantById.has(participantId)) throw new Error("选择的选手不属于本比赛");
  }
  const humanKeys = input.participantIds.map((participantId) => humanKey(competition, participantId)).filter((key): key is string => Boolean(key));
  if (new Set(humanKeys).size !== humanKeys.length) throw new Error("同一人类选手不能占据多个座次；AI 选手可以重复");

  const table = match.scheduleId ? competition.individualSchedule?.find((item) => item.id === match.scheduleId) : undefined;
  if (table && input.participantIds.some((participantId) => !table.participantIds.includes(participantId))) {
    throw new Error("本场已绑定赛程桌次，四名选手必须与该桌名单一致；如需换人请先修改赛程");
  }

  const ordered = [...match.seats].sort((left, right) => left.seat - right.seat);
  const corrected: SeatAssignment[] = ordered.map((seat) => {
    const participantId = input.participantIds[seat.seat];
    return seat.participantId === participantId ? seat : { ...seat, participantId, assignmentSource: "manual" };
  });
  const changes = ordered.flatMap((seat) => seat.participantId === input.participantIds[seat.seat] ? [] : [{
    seat: seat.seat,
    sourceUsername: seat.sourceUsername,
    fromParticipantId: seat.participantId,
    toParticipantId: input.participantIds[seat.seat],
  }]);
  if (!changes.length) throw new Error("座次没有变化，未保存");

  const correction: MatchCorrection = { at: input.at ?? new Date().toISOString(), reason, changes };
  return {
    ...match,
    seats: corrected,
    nagaRatings: reseatRatings(match.nagaRatings, ordered, corrected),
    corrections: [...(match.corrections ?? []), correction],
  };
}
