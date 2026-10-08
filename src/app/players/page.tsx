import Link from "next/link";
import { cookies } from "next/headers";
import { CirclePlus } from "lucide-react";
import { isAdmin } from "@/server/auth";
import { loadAllPersonStatistics } from "@/server/person-statistics";
import { loadPersonLuck } from "@/server/luck-statistics";
import { PlayerLeaderboard, type LeaderboardEntry } from "@/components/player-leaderboard";
import {
  LEADERBOARD_FILTER_OPEN_COOKIE,
  LEADERBOARD_TAG_COOKIE,
  leaderboardTagOptions,
  parseLeaderboardFilterOpen,
  parseLeaderboardTagSelection,
} from "@/domain/leaderboard-filter";
import { compareLeaderboardPeople } from "@/server/leaderboard";

export default async function PlayersPage() {
  const [admin, statistics, luck, cookieStore] = await Promise.all([isAdmin(), loadAllPersonStatistics(), loadPersonLuck(), cookies()]);
  const people = Object.values(statistics).sort(compareLeaderboardPeople);
  const entries: LeaderboardEntry[] = people.map(({ person, estimatedRank, estimatedRankPrecise, summary, totalCompetitionPoints }) => ({
    person,
    totalCompetitionPoints,
    estimatedRank,
    estimatedRankPrecise,
    matchCount: summary["对局数"] ?? 0,
    averageRank: summary["平均顺位"] ?? null,
    recentLuckLevel: luck[person.id]?.recent?.level ?? null,
  }));
  // 上次选的标签从 cookie 读出来直接传给榜单，首屏就是筛过的结果，不用等水合。
  const initialTags = parseLeaderboardTagSelection(
    cookieStore.get(LEADERBOARD_TAG_COOKIE)?.value,
    leaderboardTagOptions(entries.map((entry) => entry.person)).map((option) => option.tag),
  );
  const initialFilterOpen = parseLeaderboardFilterOpen(cookieStore.get(LEADERBOARD_FILTER_OPEN_COOKIE)?.value);
  return <div className="page players-page">
    <div className="page-heading"><div><p className="eyebrow">人物总榜</p><h1>排行榜</h1></div>{admin && <Link className="button primary" href="/players/new"><CirclePlus size={17} />新建人物</Link>}</div>
    <PlayerLeaderboard entries={entries} initialTags={initialTags} initialFilterOpen={initialFilterOpen} />
  </div>;
}
