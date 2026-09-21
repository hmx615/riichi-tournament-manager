import type { MajsoulRank } from "@/domain/majsoul-rank";

export type ParticipantKind = "human" | "ai";
export type CompetitionStatus = "draft" | "active" | "completed" | "archived";
export type MatchStatus = "scheduled" | "processing" | "completed" | "needs_review" | "invalid";
export type CompetitionFormat = "four_player" | "individual";

export type IndividualStage = "preliminary" | "semifinal" | "final";

export type IndividualStageSettings = {
  matchCountPerPlayer: number;
  advancingPlayerCount?: number;
};

export type IndividualCompetitionSettings = {
  stages: Record<IndividualStage, IndividualStageSettings>;
  /** Players who skip the semifinal and advance directly from preliminary to final. */
  preliminaryDirectFinalPlayerCount?: number;
  /** Players advancing from semifinal to final. */
  semifinalAdvancingPlayerCount?: number;
  pairingMode: "balanced_opponents";
};

export type IndividualScheduleStatus = "scheduled" | "completed" | "cancelled";
export type NegotiationStatus =
  /** 等待四人确认法定时间。 */
  | "legal_time"
  /** 有人提了「换时间」或「顺延下周」，等其他三人表决。 */
  | "proposal_pending"
  | "legal_time_final"
  | "confirmed"
  | "postponed"
  | "overdue"
  | "completed"
  | "cancelled";
export type NegotiationResponseStatus = "pending" | "accepted" | "declined";
export type ScheduleTimeResponse = {
  participantId: string;
  status: NegotiationResponseStatus;
  /** 选手提交的可用时间（ISO 字符串）。 */
  availableTimes: string[];
  respondedAt?: string;
  note?: string;
};
export type NegotiationProposalType = "change_time" | "postpone";
/** 换时间/顺延申请的表决票（申请人自己不投票，默认视为已同意）。 */
export type NegotiationVote = {
  participantId: string;
  status: NegotiationResponseStatus;
  /** 换时间表决时，这名玩家勾选了哪些候选时间。 */
  selectedTimes?: string[];
  respondedAt?: string;
  note?: string;
};
export type ScheduleProposal = {
  id: string;
  type: NegotiationProposalType;
  requestedBy: string;
  requestedAt: string;
  /** 换时间：申请人给出的候选时间（取最早的一个生效）；顺延：下周同一法定时间。 */
  proposedTimes: string[];
  note?: string;
  votes: NegotiationVote[];
  status: "pending" | "accepted" | "rejected";
  resolvedAt?: string;
};
export type ScheduleNegotiationEvent = {
  at: string;
  /** "admin" 或发起人的 participantId。 */
  actor: string;
  action: "confirm" | "propose" | "vote" | "settle" | "deadline" | "override" | "expire";
  detail: string;
  /** 展示用语气：同意=绿、拒绝=红、敲定=高亮。 */
  tone?: "accept" | "decline" | "settle";
};
export type ScheduleNegotiation = {
  status: NegotiationStatus;
  /** 管理员设定的法定时间，任何情况下都保留。 */
  legalTime: string;
  /** 当前生效时间：可能因改期/顺延/强制调整而变化。 */
  currentTime: string;
  deadline?: string;
  candidateTimes: string[];
  /** 法定时间确认状态，被否决的申请不会清掉这里的确认。 */
  confirmations: NegotiationVote[];
  /** 当前正在表决的申请（已结束的申请保留 status 供查看）。 */
  proposal?: ScheduleProposal;
  /** 历史申请，用于审计与展示。 */
  proposals?: ScheduleProposal[];
  /** 本场顺延被拒或已经顺延过：不能再申请顺延。 */
  postponeBlocked?: boolean;
  /** 本场已经顺延到下周。 */
  postponed?: boolean;
  override?: { at: string; reason: string; previousTime: string };
  history: ScheduleNegotiationEvent[];
};
/** 选手回应时间用的 6 位口令：只保存哈希，明文仅在生成时展示一次。 */
export type ScheduleAccessCode = {
  participantId: string;
  hash: string;
  updatedAt: string;
};
/** 整届口令的防爆破闸门：连续输错会短暂锁定提交入口。 */
export type NegotiationAccessGuard = {
  failedAttempts: number;
  lockedUntil?: string;
};
/** 阶段轮空：人数不是 4 的倍数时，这些选手本阶段少打一个半庄。 */
export type IndividualStageBye = {
  stage: IndividualStage;
  participantId: string;
};
export type IndividualScheduleTable = {
  id: string;
  stage: IndividualStage;
  round: number;
  tableNumber: number;
  scheduledAt: string;
  timezone: string;
  participantIds: string[];
  status: IndividualScheduleStatus;
  matchNumber?: number;
  /** 法定时间确认与改期协商记录。 */
  negotiation?: ScheduleNegotiation;
};

export type PersonAccount = {
  platform: "tenhou" | "majsoul" | "other";
  username: string;
};

export type Person = {
  id: string;
  displayName: string;
  kind: ParticipantKind;
  color: string;
  aliases: string[];
  accounts: PersonAccount[];
  /** 人物分类标签；旧人类档案缺省归入“国企办公厅”。 */
  tags?: string[];
  /** 手工维护的雀魂四麻段位，仅用于人物资料展示，不参与战绩计算。 */
  majsoulRank?: MajsoulRank;
  /** 魂天等级为 1–20；非魂天段位不保存该字段。 */
  majsoulCelestialLevel?: number;
  avatarKey?: string;
  avatarVersion?: number;
  avatarContentType?: "image/jpeg" | "image/png" | "image/webp";
};

export type Participant = {
  id: string;
  personId?: string;
  displayName: string;
  kind: ParticipantKind;
  color: string;
  usernames: string[];
};

export type SeatAssignment = {
  seat: 0 | 1 | 2 | 3;
  participantId: string;
  sourceUsername: string;
  rawPoints: number;
  rank: 1 | 2 | 3 | 4;
  competitionPoints: number;
  assignmentSource: "alias" | "manual" | "legacy_import";
};

export type NagaRating = {
  participantId: string;
  model: string;
  rating: number;
  agreementRate: number;
  badMoveRate: number;
  decisionCount: number;
};

/** 人工修正留下的审计记录：原始昵称永远保留在 seats 里，只记录身份变化与原因。 */
export type MatchCorrection = {
  at: string;
  reason: string;
  changes: Array<{
    seat: 0 | 1 | 2 | 3;
    sourceUsername: string;
    fromParticipantId: string | null;
    toParticipantId: string;
  }>;
};

export type MatchRecord = {
  id: string;
  matchNumber: number;
  scheduleId?: string;
  /** Optional scheduling metadata used by multi-stage individual competitions. */
  stage?: IndividualStage;
  round?: number;
  tableNumber?: number;
  status: MatchStatus;
  playedAt: string;
  tenhouLogId: string;
  contentFingerprint?: string;
  tenhouUrl: string;
  sourceType?: "tenhou" | "majsoul";
  nagaUrl: string | null;
  nagaReportId?: string | null;
  nagaRatings?: NagaRating[];
  seats: SeatAssignment[];
  reviewNote: string | null;
  /** 人工修正历史，按时间顺序追加。 */
  corrections?: MatchCorrection[];
};

export type Competition = {
  id: string;
  name: string;
  code: string;
  /** Legacy competition documents omit this and are treated as four-player competitions. */
  format?: CompetitionFormat;
  status: CompetitionStatus;
  plannedMatchCount: number;
  initialPoints: number;
  rankPoints: [number, number, number, number];
  participants: Participant[];
  matches: MatchRecord[];
  /** 人物池按任一命中标签自动追加人物；不自动移除已有成员。 */
  autoIncludePersonTags?: string[];
  individualSettings?: IndividualCompetitionSettings;
  individualSchedule?: IndividualScheduleTable[];
  /** 人数不是 4 的倍数时产生的轮空名单（按阶段）。 */
  individualByes?: IndividualStageBye[];
  /** 本届个人赛每名选手的时间协商口令（只存哈希）。 */
  negotiationAccessCodes?: ScheduleAccessCode[];
  /** 本届口令的防爆破闸门。 */
  negotiationAccessGuard?: NegotiationAccessGuard;
};

export type LegacySummary = {
  scoreGameCount: number;
  dataGameCount: number;
  handCount: number;
  colors: Record<string, string>;
  players: Record<string, {
    summary: Record<string, number | null>;
    rankCounts: number[];
    competitionPoints: number;
  }>;
  ratings: Record<string, Record<string, { average: number | null; count: number }>>;
};

export type CompetitionSeed = {
  schemaVersion: 1;
  importedAt: string;
  competition: Competition;
  legacySummary: LegacySummary;
};
