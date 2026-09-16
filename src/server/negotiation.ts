import "server-only";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getCompetition, updateCompetition } from "@/server/competition-repository";
import { negotiationFor, pendingProposal } from "@/domain/schedule-negotiation";
import {
  accessCodeLockedUntil,
  generateAccessCode,
  guardLockMinutes,
  guardMaxAttempts,
  hashAccessCode,
  isValidAccessCodeFormat,
  registerFailedAttempt,
  remainingAttempts,
  verifyAccessCode,
} from "@/domain/negotiation-access";
import { createNegotiationSession, verifyNegotiationSession } from "@/domain/negotiation-session";
import type { IndividualScheduleTable, ScheduleNegotiation } from "@/domain/types";

const sessionDays = 30;
const sessionCookiePrefix = "negotiation_session_";

export function negotiationSecret() {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

/** 管理员为本届每名选手各生成一条 8 位口令，只保存哈希，明文返回一次供转发。 */
export async function generateCompetitionAccessCodes(competitionId: string) {
  const secret = negotiationSecret();
  if (!secret) throw new Error("服务器未配置 AUTH_SECRET，无法生成口令");
  const competition = await getCompetition(competitionId);
  if (!competition) throw new Error("比赛不存在");
  const at = new Date().toISOString();
  const codes = await Promise.all(competition.participants.map(async (participant) => {
    const code = generateAccessCode();
    return { participantId: participant.id, code, hash: await hashAccessCode(secret, code) };
  }));
  competition.negotiationAccessCodes = codes.map((item) => ({ participantId: item.participantId, hash: item.hash, updatedAt: at }));
  competition.negotiationAccessGuard = { failedAttempts: 0 };
  await updateCompetition(competition);
  revalidatePath(`/competitions/${competition.id}/schedule`);
  return codes.map(({ participantId, code }) => ({ participantId, code }));
}

/**
 * 校验本届口令并返回对应的选手：一条口令在本届通用，
 * 连续输错达到上限会短暂锁住提交入口（保存在比赛数据里，不需要后台任务）。
 */
export async function identifyParticipantByCode(competitionId: string, code: string) {
  const secret = negotiationSecret();
  if (!secret) throw new Error("服务器未配置 AUTH_SECRET，无法校验口令");
  const competition = await getCompetition(competitionId);
  if (!competition) throw new Error("比赛不存在");
  const codes = competition.negotiationAccessCodes ?? [];
  if (!codes.length) throw new Error("本届还没有生成口令，请联系管理员");
  if (!isValidAccessCodeFormat(code)) throw new Error("口令是 8 位数字");
  const normalized = code.replace(/\s/g, "");
  const guard = competition.negotiationAccessGuard ?? { failedAttempts: 0 };
  const lockedUntil = accessCodeLockedUntil(guard);
  if (lockedUntil) {
    const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
    throw new Error(`口令连续输错，提交入口已锁定，请 ${minutes} 分钟后再试`);
  }
  for (const entry of codes) {
    if (await verifyAccessCode(secret, normalized, entry.hash)) {
      if (guard.failedAttempts) {
        competition.negotiationAccessGuard = { failedAttempts: 0 };
        await updateCompetition(competition);
      }
      return entry.participantId;
    }
  }
  const next = registerFailedAttempt(guard, new Date(), { maxAttempts: guardMaxAttempts, lockMinutes: guardLockMinutes });
  competition.negotiationAccessGuard = next;
  await updateCompetition(competition);
  throw new Error(next.lockedUntil
    ? `口令连续输错 ${guardMaxAttempts} 次，请 ${guardLockMinutes} 分钟后再试`
    : `口令不正确，还可以尝试 ${remainingAttempts(next, guardMaxAttempts)} 次`);
}

function sessionCookieName(competitionId: string) {
  return `${sessionCookiePrefix}${competitionId}`;
}

/** 口令验证通过后签发会话 Cookie；之后本届内不再需要重复输入口令。 */
export async function startNegotiationSession(competitionId: string, code: string) {
  const secret = negotiationSecret();
  if (!secret) throw new Error("服务器未配置 AUTH_SECRET，无法登录协商页");
  const participantId = await identifyParticipantByCode(competitionId, code);
  const token = await createNegotiationSession(secret, {
    competitionId,
    participantId,
    expiresAt: Date.now() + sessionDays * 24 * 60 * 60 * 1000,
  });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(competitionId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.AUTH_COOKIE_SECURE !== "false"),
    path: "/",
    maxAge: sessionDays * 24 * 60 * 60,
  });
  return participantId;
}

export async function readNegotiationSession(competitionId: string) {
  const secret = negotiationSecret();
  if (!secret) return null;
  const token = (await cookies()).get(sessionCookieName(competitionId))?.value;
  if (!token) return null;
  const payload = await verifyNegotiationSession(secret, token);
  if (!payload || payload.competitionId !== competitionId) return null;
  return payload;
}

export async function clearNegotiationSession(competitionId: string) {
  (await cookies()).delete(sessionCookieName(competitionId));
}

async function mutateNegotiation(competitionId: string, scheduleId: string, mutate: (negotiation: ScheduleNegotiation, table: IndividualScheduleTable) => ScheduleNegotiation) {
  const competition = await getCompetition(competitionId);
  if (!competition?.individualSchedule) throw new Error("该比赛没有独立赛程");
  const table = competition.individualSchedule.find((item) => item.id === scheduleId);
  if (!table) throw new Error("找不到赛程桌次");
  const next = mutate(negotiationFor(table), table);
  table.negotiation = next;
  // 当前生效时间同时写回赛程时间；法定时间保存在 negotiation.legalTime。
  table.scheduledAt = next.currentTime;
  await updateCompetition(competition);
  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath(`/competitions/${competition.id}/schedule`);
  revalidatePath(`/competitions/${competition.id}/matches`);
  return next;
}

/** 管理员直接改协商数据。 */
export async function updateTableNegotiation(competitionId: string, scheduleId: string, mutate: (negotiation: ScheduleNegotiation, table: IndividualScheduleTable) => ScheduleNegotiation) {
  return mutateNegotiation(competitionId, scheduleId, mutate);
}

/** 选手提交（身份来自会话 Cookie，不再重复输入口令）。 */
export async function applyNegotiationForParticipant(
  competitionId: string,
  scheduleId: string,
  mutate: (negotiation: ScheduleNegotiation, table: IndividualScheduleTable, participantId: string) => ScheduleNegotiation,
) {
  const session = await readNegotiationSession(competitionId);
  if (!session) throw new Error("请先输入口令进入协商页");
  const participantId = session.participantId;
  return mutateNegotiation(competitionId, scheduleId, (negotiation, table) => {
    if (!table.participantIds.includes(participantId)) throw new Error("你不在这桌的参赛名单里");
    return mutate(negotiation, table, participantId);
  });
}

/** 选手在某一桌是否还需要处理（确认法定时间或给申请投票）。 */
export function needsMyAction(table: IndividualScheduleTable, participantId: string) {
  const negotiation = negotiationFor(table);
  const status = negotiation.status;
  if (status === "confirmed" || status === "postponed" || status === "legal_time_final" || status === "completed" || status === "cancelled") return false;
  const proposal = pendingProposal(negotiation);
  if (proposal) return proposal.requestedBy !== participantId && proposal.votes.some((vote) => vote.participantId === participantId && vote.status === "pending");
  const confirmation = negotiation.confirmations.find((item) => item.participantId === participantId);
  return confirmation?.status === "pending";
}

/** 选手还需要处理、且时间最近的桌次（协商页默认只放开这一场）。 */
export function nextTableForParticipant(tables: IndividualScheduleTable[], participantId: string) {
  return tables
    .filter((table) => table.status !== "cancelled" && table.participantIds.includes(participantId))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt))
    .find((table) => needsMyAction(table, participantId));
}
