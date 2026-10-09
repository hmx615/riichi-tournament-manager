import type { MajsoulRank } from "@/domain/majsoul-rank";

export type ParticipantKind = "human" | "ai";
export type CompetitionStatus = "draft" | "active" | "completed" | "archived";
export type MatchStatus = "scheduled" | "processing" | "completed" | "needs_review" | "invalid";
export type CompetitionFormat = "four_player" | "individual";

/** 个人赛只有初赛（日常周 + 淘汰周）与决赛两个阶段。 */
export type IndividualStage = "preliminary" | "final";

/** 初赛日程：前若干周是日常周（只打不淘汰），之后每周结算一次淘汰末位选手。 */
export type IndividualPreliminarySettings = {
  /** 日常周数：第 1–N 周不产生淘汰。 */
  regularWeeks: number;
  /** 淘汰周数：第 N+1 周起每周结算一次淘汰。 */
  eliminationWeeks: number;
  /** 每周每人半庄数，也就是每周的轮数。 */
  matchesPerPlayerPerWeek: number;
  /** 每周淘汰人数。 */
  eliminationCountPerWeek: number;
  /** 淘汰到只剩几人进入决赛。 */
  finalistCount: number;
  /** 每周两个法定比赛日（0=周日，3=周三），默认周日 + 周三。 */
  legalWeekdays?: [number, number];
  /** 两个比赛日的开赛时间（北京时间 HH:mm），默认 20:00、21:30。 */
  legalTimes?: [string, string];
  /** 第一周的第一个比赛日（周日），例如 2026-10-11。 */
  startDate?: string;
};

export type IndividualCompetitionSettings = {
  preliminary: IndividualPreliminarySettings;
  final: { matchCountPerPlayer: number };
  pairingMode: "balanced_opponents";
};

/** 淘汰周结算结果：第几周淘汰了谁。 */
export type IndividualElimination = {
  stage: IndividualStage;
  week: number;
  participantIds: string[];
  /** 结算时的积分快照，仅用于复盘展示。 */
  points?: Record<string, number>;
  at: string;
};

/** 管理员手工加减分（迟到扣分、误判修正等），只计入所在阶段。 */
export type IndividualAdjustment = {
  id: string;
  stage: IndividualStage;
  participantId: string;
  points: number;
  reason: string;
  at: string;
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
  /** 本桌的额外协商限制：淘汰周只允许提前、不允许顺延。 */
  rules?: { onlyEarlier?: boolean; noPostpone?: boolean };
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
  /** 阶段内的第几周（初赛 1–7、决赛 1–3），旧数据缺省按第 1 周处理。 */
  week?: number;
  /** 本桌的额外协商限制：淘汰周只允许提前、不允许顺延。 */
  rules?: { onlyEarlier?: boolean; noPostpone?: boolean };
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
  /**
   * 共用账号的优先归属：某个昵称同时挂在多人名下、且同桌确实有歧义时，优先判给登记了它的本人。
   * 在人物设置里维护，不再把规则写死在代码里。
   */
  sharedAccountPriority?: string[];
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
  /** 初赛/决赛中的第几周（个人赛按周结算淘汰时使用）。 */
  week?: number;
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
  /**
   * 赛程正式发布时间。发布后视为对选手的承诺，重排脚本会拒绝自动改写，
   * 要改必须人工确认并留档。
   */
  schedulePublishedAt?: string;
  /** 发布时的赛程摘要（桌次数、人数、起始时间），用于核对当前赛程是否被动过。 */
  schedulePublishedSummary?: {
    tables: number;
    participants: number;
    firstTableAt: string;
    lastTableAt: string;
    /** 发布时间点的赛程内容指纹，用来发现发布后被改动。 */
    fingerprint: string;
  };
  /** 人数不是 4 的倍数时产生的轮空名单（按阶段）。 */
  individualByes?: IndividualStageBye[];
  /** 淘汰周每周结算的结果（第几周淘汰了谁）。 */
  individualEliminations?: IndividualElimination[];
  /** 管理员手工加减分记录。 */
  individualAdjustments?: IndividualAdjustment[];
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
