import type { Person } from "@/domain/types";

export const casualSourceTypes = ["tenhou", "majsoul", "naga"] as const;
export type CasualSourceType = (typeof casualSourceTypes)[number];

/** 散排的顺位点仅用于内部排序，不对外展示为「比赛积分」。 */
export const casualRankPoints: [number, number, number, number] = [30, 10, -10, -30];
export const casualInitialPoints = 25000;

export type CasualSeat = {
  seat: 0 | 1 | 2 | 3;
  /** 人物池内选手；与 guestName 二选一。 */
  personId: string | null;
  /** 不在人物池里的排位对手昵称；只做展示，不建人物档案。 */
  guestName: string | null;
  /** 牌谱里的原始昵称，永远保留。 */
  sourceUsername: string;
  rawPoints: number;
  rank: 1 | 2 | 3 | 4;
};

export type CasualSeatNagaRating = {
  seat: 0 | 1 | 2 | 3;
  model: string;
  rating: number;
  agreementRate: number;
  badMoveRate: number;
  decisionCount: number;
};

export type CasualRecord = {
  id: string;
  playedAt: string;
  sourceType: CasualSourceType;
  sourceUrl: string;
  tenhouLogId: string;
  tenhouUrl: string;
  nagaUrl: string | null;
  nagaReportId: string | null;
  contentFingerprint: string;
  seats: CasualSeat[];
  /** 只有 NAGA 来源的牌谱才有 Rating；散排的推定段位只按这部分计算。 */
  nagaRatings: CasualSeatNagaRating[];
  createdByPersonId: string | null;
  createdByUsername: string;
  createdAt: string;
};

export function casualSeatLabel(seat: Pick<CasualSeat, "personId" | "guestName">, peopleById: Map<string, Person>) {
  if (seat.personId) return peopleById.get(seat.personId)?.displayName ?? seat.personId;
  return seat.guestName?.trim() || "未命名对手";
}

export function casualRecordPersonIds(record: CasualRecord) {
  return record.seats.flatMap((seat) => (seat.personId ? [seat.personId] : []));
}

export function casualRecordIncludesPerson(record: CasualRecord, personId: string) {
  return casualRecordPersonIds(record).includes(personId);
}

export function casualRecordHasNaga(record: CasualRecord) {
  return Boolean(record.nagaUrl) && record.nagaRatings.length > 0;
}

export const casualGuestNameMaxLength = 30;

/** 返回错误文案；合法时返回 null。 */
export function casualSeatError(
  seats: Array<{ personId?: string | null; guestName?: string | null }>,
  options: { requiredPersonId?: string | null } = {},
) {
  if (seats.length !== 4) return "散排牌谱必须正好四家";
  const personIds: string[] = [];
  for (const [index, seat] of seats.entries()) {
    const personId = seat.personId?.trim() || "";
    const guestName = seat.guestName?.trim() || "";
    if (!personId && !guestName) return `第 ${index + 1} 家还没有填写选手或排位对手昵称`;
    if (personId && guestName) return `第 ${index + 1} 家同时选择了选手和排位对手，请二选一`;
    if (guestName.length > casualGuestNameMaxLength) return `第 ${index + 1} 家的对手昵称不能超过 ${casualGuestNameMaxLength} 个字符`;
    if (personId) {
      if (personIds.includes(personId)) return "同一人物不能在散排里占两个座次";
      personIds.push(personId);
    }
  }
  const requiredPersonId = options.requiredPersonId?.trim();
  if (requiredPersonId && !personIds.includes(requiredPersonId)) return "只能录入包含你自己的散排牌谱";
  return null;
}
