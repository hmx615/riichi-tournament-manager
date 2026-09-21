"use server";

/**
 * 散排（自选牌谱）录入：管理员可录任意牌谱，选手只能录包含自己的牌谱。
 * 数据写入 casual_* 表，与正式比赛统计完全隔离。
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Person } from "@/domain/types";
import {
  casualSeatError,
  type CasualRecord,
  type CasualSeat,
  type CasualSeatNagaRating,
  type CasualSourceType,
} from "@/domain/casual-record";
import { isAdmin } from "@/server/auth";
import { currentPlayer } from "@/server/player-auth";
import { listPeople } from "@/server/person-repository";
import {
  parseCachedMajsoulSource,
  parseMajsoulJsonSource,
  parseMatchSource,
  readCachedLog,
  type MatchPreview,
} from "@/server/tenhou";
import { casualMatchingCompetition } from "@/server/casual-statistics";
import { deleteCasualRecord, findCasualRecordByLog, getCasualRecord, saveCasualRecord } from "@/server/casual-repository";

export type CasualEntryState = {
  status: "idle" | "success" | "error";
  message: string;
  preview: MatchPreview | null;
};

const failed = (message: string): CasualEntryState => ({ status: "error", message, preview: null });

const sourceSchema = z.string().trim().url("请输入完整的天凤或 NAGA 链接");
const sourceKindSchema = z.enum(["link", "majsoul_json"]);
const maxMajsoulJsonBytes = 2 * 1024 * 1024;

type Actor = { username: string; personId: string | null; isAdmin: boolean };

async function currentActor(): Promise<Actor | null> {
  if (await isAdmin()) return { username: "管理员", personId: null, isAdmin: true };
  const player = await currentPlayer();
  if (!player) return null;
  return { username: player.username, personId: player.personId, isAdmin: false };
}

function actorError(actor: Actor | null) {
  if (!actor) return "请先登录后再录入散排牌谱";
  if (!actor.isAdmin && !actor.personId) return "该账号还没有绑定人物，请联系管理员绑定后再录入";
  return null;
}

function personIdFromParticipant(participantId: string | null | undefined) {
  return participantId?.startsWith("person-") ? participantId.slice("person-".length) : null;
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.text === "function");
}

async function previewFromForm(formData: FormData, people: Person[]) {
  const competition = casualMatchingCompetition(people);
  const sourceKind = sourceKindSchema.safeParse(formData.get("sourceKind") || "link");
  if (!sourceKind.success) throw new Error("数据源类型无效");
  if (sourceKind.data === "link") {
    const source = sourceSchema.safeParse(formData.get("sourceUrl"));
    if (!source.success) throw new Error(source.error.issues[0]?.message || "链接格式无效");
    return parseMatchSource(source.data, competition);
  }
  const jsonText = String(formData.get("majsoulJsonText") || "").trim();
  if (jsonText) {
    if (new TextEncoder().encode(jsonText).byteLength > maxMajsoulJsonBytes) throw new Error("雀魂 JSON 内容不能超过 2 MB");
    return parseMajsoulJsonSource(jsonText, competition);
  }
  const file = formData.get("majsoulJson");
  if (isUploadedFile(file) && file.size > 0) {
    if (file.size > maxMajsoulJsonBytes) throw new Error("雀魂 JSON 文件不能超过 2 MB");
    return parseMajsoulJsonSource(await file.text(), competition);
  }
  const cachedLogId = String(formData.get("parsedLogId") || "");
  if (cachedLogId) return parseCachedMajsoulSource(cachedLogId, competition);
  throw new Error("请选择 Ricochet 导出的雀魂 JSON 文件");
}

function seatsFromForm(formData: FormData, preview: MatchPreview) {
  return preview.seats.map((seat) => {
    const personId = String(formData.get(`person${seat.seat}`) || "").trim();
    const guestName = String(formData.get(`guest${seat.seat}`) || "").trim();
    return {
      seat: seat.seat,
      personId: personId || null,
      guestName: personId ? null : guestName || null,
      sourceUsername: seat.sourceUsername,
      rawPoints: seat.rawPoints,
      rank: seat.rank,
    } satisfies CasualSeat;
  });
}

function nagaRatingsFromPreview(preview: MatchPreview): CasualSeatNagaRating[] {
  return preview.nagaRatings.flatMap((rating) => [{
    seat: rating.seat,
    model: rating.model,
    rating: rating.rating,
    agreementRate: rating.agreementRate,
    badMoveRate: rating.badMoveRate,
    decisionCount: rating.decisionCount,
  }]);
}

export async function parseCasualAction(_state: CasualEntryState, formData: FormData): Promise<CasualEntryState> {
  const actor = await currentActor();
  const blocked = actorError(actor);
  if (blocked || !actor) return failed(blocked ?? "请先登录后再录入散排牌谱");
  try {
    const people = await listPeople();
    const preview = await previewFromForm(formData, people);
    const recorded = await findCasualRecordByLog(preview.logId, preview.contentFingerprint);
    if (recorded) return failed("这份牌谱已经录入过散排，不能重复录入");
    if (!actor.isAdmin) {
      const matched = preview.seats.map((seat) => personIdFromParticipant(seat.participantId));
      if (!matched.includes(actor.personId)) {
        const self = people.find((person) => person.id === actor.personId);
        return {
          status: "idle",
          message: `没有自动识别到你自己（${self?.displayName ?? actor.personId}）。请在下面把自己选进四家，否则无法保存。`,
          preview,
        };
      }
    }
    return { status: "success", message: "解析完成，请核对四家身份后保存", preview };
  } catch (error) {
    return failed(error instanceof Error ? error.message : "牌谱解析失败");
  }
}

export async function saveCasualAction(_state: CasualEntryState, formData: FormData): Promise<CasualEntryState> {
  const actor = await currentActor();
  const blocked = actorError(actor);
  if (blocked || !actor) return failed(blocked ?? "请先登录后再录入散排牌谱");
  let preview: MatchPreview;
  try {
    preview = await previewFromForm(formData, await listPeople());
  } catch (error) {
    return failed(error instanceof Error ? error.message : "牌谱解析失败");
  }
  const seats = seatsFromForm(formData, preview);
  const seatError = casualSeatError(seats, { requiredPersonId: actor.isAdmin ? null : actor.personId });
  if (seatError) return { status: "error", message: seatError, preview };
  const recorded = await findCasualRecordByLog(preview.logId, preview.contentFingerprint);
  if (recorded) return { status: "error", message: "这份牌谱已经录入过散排，不能重复录入", preview };
  const log = await readCachedLog(preview.logId);
  if (!log) return { status: "error", message: "牌谱缓存已失效，请重新解析一次", preview };

  const sourceType: CasualSourceType = preview.sourceType === "majsoul" ? "majsoul" : preview.sourceType;
  const record: CasualRecord = {
    id: crypto.randomUUID(),
    playedAt: preview.playedAt,
    sourceType,
    sourceUrl: preview.sourceUrl,
    tenhouLogId: preview.logId,
    tenhouUrl: preview.tenhouUrl,
    nagaUrl: preview.nagaUrl,
    nagaReportId: preview.nagaReportId,
    contentFingerprint: preview.contentFingerprint,
    seats,
    nagaRatings: nagaRatingsFromPreview(preview),
    createdByPersonId: actor.personId,
    createdByUsername: actor.username,
    createdAt: new Date().toISOString(),
  };
  try {
    await saveCasualRecord(record, log);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "散排牌谱保存失败", preview };
  }
  revalidatePath("/casual");
  revalidatePath("/players");
  return { status: "success", message: "散排牌谱已保存，可在人物页的散排数据里查看", preview: null };
}

export async function deleteCasualAction(formData: FormData) {
  const actor = await currentActor();
  if (!actor) return;
  const id = String(formData.get("recordId") || "");
  if (!id) return;
  const record = await getCasualRecord(id);
  if (!record) return;
  const owner = actor.isAdmin
    || record.createdByUsername === actor.username
    || Boolean(actor.personId && record.createdByPersonId === actor.personId);
  if (!owner) return;
  await deleteCasualRecord(id);
  revalidatePath("/casual");
  revalidatePath("/players");
}
