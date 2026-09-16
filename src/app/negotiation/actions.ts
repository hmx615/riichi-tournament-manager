"use server";

import { redirect } from "next/navigation";
import { confirmLegalTime, parseTableTimeInput, proposeChangeTime, proposePostpone, voteProposal } from "@/domain/schedule-negotiation";
import { applyNegotiationForParticipant, clearNegotiationSession, startNegotiationSession } from "@/server/negotiation";

const modes = ["confirm", "change_time", "postpone", "vote_accept", "vote_decline"] as const;

function backTo(competitionId: string, query: string) {
  redirect(`/negotiation?competition=${encodeURIComponent(competitionId)}${query}`);
}

/** 页面入口：输入 8 位口令进入自己的赛程页（之后由会话 Cookie 记住身份）。 */
export async function startNegotiationSessionAction(formData: FormData) {
  const competitionId = String(formData.get("competitionId") || "");
  const accessCode = String(formData.get("accessCode") || "");
  try {
    await startNegotiationSession(competitionId, accessCode);
  } catch (error) {
    backTo(competitionId, `&error=${encodeURIComponent(error instanceof Error ? error.message : "口令校验失败，请重试")}`);
  }
  backTo(competitionId, "");
}

export async function leaveNegotiationSessionAction(formData: FormData) {
  const competitionId = String(formData.get("competitionId") || "");
  await clearNegotiationSession(competitionId);
  backTo(competitionId, "");
}

/** 选手在自己最近的一场桌次上提交：确认法定时间 / 申请换时间 / 申请顺延 / 给申请投票。 */
export async function submitNegotiationAction(formData: FormData) {
  const competitionId = String(formData.get("competitionId") || "");
  const scheduleId = String(formData.get("scheduleId") || "");
  const mode = String(formData.get("mode") || "");
  const note = String(formData.get("note") || "").trim();
  const proposedTimes = formData.getAll("proposedTime")
    .map((value) => parseTableTimeInput(String(value)))
    .filter((value): value is string => Boolean(value));
  const selectedTimes = formData.getAll("selectedTime").map((value) => String(value)).filter(Boolean);
  const cannotAttend = String(formData.get("cannotAttendAny") || "") === "1";
  if (!modes.includes(mode as typeof modes[number])) backTo(competitionId, `&error=${encodeURIComponent("请选择要提交的选项")}`);
  const at = new Date().toISOString();
  try {
    await applyNegotiationForParticipant(competitionId, scheduleId, (negotiation, _table, participantId) => {
      switch (mode) {
        case "confirm":
          return confirmLegalTime(negotiation, { participantId, note, at });
        case "change_time":
          return proposeChangeTime(negotiation, { participantId, times: proposedTimes, note, at });
        case "postpone":
          return proposePostpone(negotiation, { participantId, note, at });
        case "vote_accept":
          return voteProposal(negotiation, { participantId, accept: !cannotAttend, selectedTimes, note, at });
        case "vote_decline":
          return voteProposal(negotiation, { participantId, accept: false, note, at });
        default:
          throw new Error("无效的提交选项");
      }
    });
  } catch (error) {
    backTo(competitionId, `&error=${encodeURIComponent(error instanceof Error ? error.message : "提交失败，请重试")}`);
  }
  backTo(competitionId, `&done=${encodeURIComponent(scheduleId)}#table-${encodeURIComponent(scheduleId)}`);
}
