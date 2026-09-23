import type { Person, PersonAccount } from "@/domain/types";
import { majsoulRanks, type MajsoulRank } from "@/domain/majsoul-rank";
import { personIdError } from "@/domain/person-id";

/**
 * 从「信息收集」记录里推断人物档案草稿。
 *
 * 这里是按字段名与取值的模式识别，不绑定某一张固定表单：
 * 以后换一份收集表，只要还写着姓名、雀魂昵称、段位之类的字段，就能直接拿来建人物。
 */
export type PersonDraft = {
  id: string;
  displayName: string;
  aliases: string[];
  accounts: PersonAccount[];
  majsoulRank?: MajsoulRank;
  color: string;
  tags: string[];
  /** 没能自动归位、需要人工确认的原始内容。 */
  notes: string[];
  /** 用到了原始记录的哪些字段（便于管理员核对）。 */
  sources: string[];
};

const palette = ["#168f83", "#3b78a0", "#6657c7", "#d1495b", "#d58a18", "#9c5f9c", "#4d9b73", "#b56a3b", "#4e8fc5", "#c25b35", "#4a5f9e", "#8a6f2f"];

/** 按使用次数最少的颜色轮着给，避免新建人物颜色重复。 */
export function pickPersonColor(usedColors: string[]) {
  const counts = new Map(palette.map((color) => [color, 0]));
  for (const color of usedColors) counts.set(color, (counts.get(color) ?? 0) + 1);
  return palette.reduce((best, color) => ((counts.get(color) ?? 0) < (counts.get(best) ?? 0) ? color : best), palette[0]);
}

function slugify(value: string) {
  const trimmed = value.trim().replace(/[\s]+/g, "").replace(/[\\/]/g, "").replace(/^\.+$/, "");
  return trimmed.slice(0, 40);
}

/** 与已有 ID 冲突时补 -2、-3…，保证建号不会因为重名失败。 */
export function uniquePersonId(candidate: string, usedIds: string[]) {
  const base = slugify(candidate) || "player";
  const taken = new Set(usedIds.map((id) => id.toLowerCase()));
  if (!taken.has(base.toLowerCase()) && !personIdError(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const next = `${base}-${index}`;
    if (!taken.has(next.toLowerCase()) && !personIdError(next)) return next;
  }
  return `${base}-${Date.now()}`;
}

const emptyValues = new Set(["", "-", "—", "无", "none", "null", "undefined", "n/a"]);

function cleaned(value: unknown) {
  const text = String(value ?? "").trim();
  return emptyValues.has(text.toLowerCase()) ? "" : text;
}

function isMajsoulRank(value: string): value is MajsoulRank {
  return (majsoulRanks as readonly string[]).includes(value);
}

type FieldRole = "name" | "majsoulNickname" | "tenhouNickname" | "rank" | "ignore" | "other";

function fieldRole(key: string): FieldRole {
  // 收集表的元数据字段（记录 ID、提交时间、各种勾选确认）不进人物档案。
  if (/^(id|.*_id|createdat|created_at|updatedat|updated_at|privacyconsent|.*confirmed|owns.*)$/i.test(key)) return "ignore";
  if (/(qq|微信|wechat|phone|手机|学号|student|email|邮箱|密码|password)/i.test(key)) return "ignore";
  if (/(majsoul|雀魂|雀魂四麻)/i.test(key)) {
    if (/(id|编号|号)/i.test(key) && !/(nick|昵称|名字|name)/i.test(key)) return "ignore";
    return "majsoulNickname";
  }
  if (/(tenhou|天凤)/i.test(key)) return "tenhouNickname";
  if (/(rank|段位|等级|level)/i.test(key)) return "rank";
  if (/(nick|昵称|网名|姓名|name|id)/i.test(key)) return "name";
  return "other";
}

/**
 * @param record 任意信息收集记录（键值对）
 * @param context 已有人物，用于挑颜色、避让重名 ID
 */
export function personDraftFromRecord(
  record: Record<string, unknown>,
  context: { people: Person[]; defaultTags?: string[] },
): PersonDraft {
  const names: string[] = [];
  const majsoulNames: string[] = [];
  const tenhouNames: string[] = [];
  const ranks: string[] = [];
  const notes: string[] = [];
  const sources: string[] = [];

  for (const [key, rawValue] of Object.entries(record)) {
    const value = cleaned(rawValue);
    if (!value) continue;
    switch (fieldRole(key)) {
      case "majsoulNickname": majsoulNames.push(value); sources.push(key); break;
      case "tenhouNickname": tenhouNames.push(value); sources.push(key); break;
      case "rank": ranks.push(value); sources.push(key); break;
      case "name": names.push(value); sources.push(key); break;
      case "ignore": break;
      default: notes.push(`${key}：${value}`); break;
    }
  }

  const displayName = names[0] || majsoulNames[0] || tenhouNames[0] || "未命名";
  const aliases = [...new Set([displayName, ...names, ...majsoulNames, ...tenhouNames])].filter(Boolean);
  const accounts: PersonAccount[] = [
    ...majsoulNames.map((username) => ({ platform: "majsoul" as const, username })),
    ...tenhouNames.map((username) => ({ platform: "tenhou" as const, username })),
  ].filter((account, index, list) => list.findIndex((item) => item.platform === account.platform && item.username === account.username) === index);

  // 段位只在能对上雀魂段位表时自动填；像「天凤5段」「其他 / 暂未定级」留给人工确认。
  const majsoulRank = ranks.find(isMajsoulRank);
  for (const rank of ranks) {
    if (rank !== majsoulRank) notes.push(`段位未自动填入：${rank}`);
  }

  return {
    id: uniquePersonId(displayName, context.people.map((person) => person.id)),
    displayName,
    aliases,
    accounts,
    ...(majsoulRank ? { majsoulRank } : {}),
    color: pickPersonColor(context.people.map((person) => person.color)),
    tags: context.defaultTags ?? [],
    notes,
    sources: [...new Set(sources)],
  };
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

/** 判断这条收集记录是不是已经建过人物（按昵称/账号比对）。 */
export function findPersonForDraft(draft: PersonDraft, people: Person[]) {
  const keys = new Set([...draft.aliases, ...draft.accounts.map((account) => account.username)].map(normalized).filter(Boolean));
  return people.find((person) => {
    const candidates = [person.displayName, ...person.aliases, ...person.accounts.map((account) => account.username)].map(normalized);
    return candidates.some((candidate) => keys.has(candidate));
  }) ?? null;
}
