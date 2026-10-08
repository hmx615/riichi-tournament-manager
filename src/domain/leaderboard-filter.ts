import { personTags, type PersonTagSource } from "./person-tags";

/**
 * 排行榜标签筛选的记忆位置。
 *
 * 之前没有记忆时，换台设备、隔天再打开都会退回"显示全部人物"。
 * 这里写一年有效期的 cookie，并由服务端渲染时读取，所以首屏就是上次选中的标签。
 */
export const LEADERBOARD_TAG_COOKIE = "xrc-leaderboard-tags";
export const LEADERBOARD_TAG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** 筛选框展开／收起状态，和标签选择一样按年记住。 */
export const LEADERBOARD_FILTER_OPEN_COOKIE = "xrc-leaderboard-filter-open";

export type LeaderboardTagOption = { tag: string; count: number };

/** 可筛选的标签：只列当前确实挂在某个人身上的标签，人数多的排前面。 */
export function leaderboardTagOptions(people: readonly PersonTagSource[]): LeaderboardTagOption[] {
  const counts = new Map<string, number>();
  for (const person of people) {
    for (const tag of personTags(person)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "zh-Hans-CN"));
}

/** 选了标签就按并集显示（标签之间有一个人重合也不会重复出现）；一个都没选时显示全部人物。 */
export function matchesLeaderboardTags(person: PersonTagSource, selectedTags: readonly string[]) {
  if (!selectedTags.length) return true;
  const tags = personTags(person);
  return selectedTags.some((tag) => tags.includes(tag));
}

/**
 * 还原 cookie 里的标签选择。
 * 已经不存在（被删掉或没人挂着）的标签会被丢掉，否则标签一删榜单就被筛成空的。
 */
export function parseLeaderboardTagSelection(value: string | null | undefined, availableTags: readonly string[]) {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(value));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const available = new Set(availableTags);
  return [...new Set(parsed.filter((item): item is string => typeof item === "string" && available.has(item)))];
}

/** 写 cookie 用的值：中文标签要转义，避免非法 cookie 字符。 */
export function serializeLeaderboardTagSelection(tags: readonly string[]) {
  return encodeURIComponent(JSON.stringify([...new Set(tags)]));
}

export function serializeLeaderboardFilterOpen(open: boolean) {
  return open ? "1" : "0";
}

/** 没存过或值不合法时按 fallback 展开，保证第一次来还能看到标签。 */
export function parseLeaderboardFilterOpen(value: string | null | undefined, fallback = true) {
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}
