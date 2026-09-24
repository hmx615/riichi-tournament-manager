import type { PersonAccount } from "@/domain/types";

export type PersonAccountBinding = { personId: string; account: PersonAccount };

/**
 * 把「这一桌的原始昵称属于某个人物」整理成可写入人物档案的账号绑定。
 *
 * 手工把没匹配上的昵称指给某个人之后，昵称会以该平台账号的形式记进人物档案，
 * 下次同平台的牌谱就能自动匹配；识别不出平台时按「其他账号」记下来，仍然能在
 * 人物池的昵称表里参与匹配。
 */
export function personAccountBindings(
  seats: Array<{ personId: string | null; sourceUsername: string }>,
  platform: PersonAccount["platform"] | null,
): PersonAccountBinding[] {
  const bindings = seats.flatMap((seat) => {
    const username = seat.sourceUsername?.trim();
    if (!seat.personId || !username) return [];
    return [{ personId: seat.personId, account: { platform: platform ?? "other" as const, username } }];
  });
  return [...new Map(bindings.map((binding) => [
    `${binding.personId}\u0000${binding.account.platform}\u0000${binding.account.username}`,
    binding,
  ])).values()];
}
