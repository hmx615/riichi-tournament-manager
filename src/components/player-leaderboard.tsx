"use client";

import Link from "next/link";
import { ArrowRight, ListFilter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { EstimatedRank } from "@/domain/estimated-rank";
import {
  LEADERBOARD_TAG_COOKIE,
  LEADERBOARD_TAG_COOKIE_MAX_AGE,
  leaderboardTagOptions,
  matchesLeaderboardTags,
  parseLeaderboardTagSelection,
  serializeLeaderboardTagSelection,
} from "@/domain/leaderboard-filter";
import type { LuckLevel } from "@/domain/luck";
import type { Person } from "@/domain/types";
import { EstimatedRankValue } from "@/components/estimated-rank-value";
import { MajsoulRankBadge } from "@/components/majsoul-rank-badge";
import { PersonAvatar } from "@/components/person-avatar";
import { PersonTags } from "@/components/person-tags";
import { luckInlinePillClass, luckLevelClass, luckPillClass } from "@/components/luck-level";
import styles from "@/app/players/players.module.css";

export type LeaderboardEntry = {
  person: Person;
  totalCompetitionPoints: number;
  estimatedRank: EstimatedRank | null;
  estimatedRankPrecise: number | null;
  matchCount: number;
  averageRank: number | null;
  recentLuckLevel: LuckLevel | null;
};

/** 把选中的标签写进 cookie，服务端下次渲染就能直接按这个过滤，不用等水合。 */
function rememberTags(tags: string[]) {
  document.cookie = `${LEADERBOARD_TAG_COOKIE}=${serializeLeaderboardTagSelection(tags)}`
    + `; path=/; max-age=${LEADERBOARD_TAG_COOKIE_MAX_AGE}; samesite=lax`;
}

function readRememberedTags() {
  const prefix = `${LEADERBOARD_TAG_COOKIE}=`;
  const entry = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : undefined;
}

function sameTags(left: string[], right: string[]) {
  return left.length === right.length && left.every((tag) => right.includes(tag));
}

export function PlayerLeaderboard({ entries, initialTags }: { entries: LeaderboardEntry[]; initialTags: string[] }) {
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const options = useMemo(() => leaderboardTagOptions(entries.map((entry) => entry.person)), [entries]);
  const availableTagNames = useMemo(() => options.map((option) => option.tag), [options]);
  const visible = useMemo(() => entries.filter((entry) => matchesLeaderboardTags(entry.person, selectedTags)), [entries, selectedTags]);
  const humanCount = visible.filter((entry) => entry.person.kind === "human").length;
  const celestialCount = visible.filter((entry) => entry.person.kind === "human" && entry.person.majsoulRank === "魂天").length;

  // 客户端路由缓存会把 30 秒内的旧载荷直接还回来，那时 props 里的 initialTags 已经过期；
  // 挂载后再按 cookie 校正一次，避免"刚选好标签，切走再切回来又变回全部人物"。
  useEffect(() => {
    const remembered = parseLeaderboardTagSelection(readRememberedTags(), availableTagNames);
    setSelectedTags((current) => (sameTags(current, remembered) ? current : remembered));
    // 只在首次挂载时校正，之后以用户点击为准。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTags(tags: string[]) {
    const next = [...new Set(tags)];
    setSelectedTags(next);
    rememberTags(next);
  }

  function toggleTag(tag: string) {
    applyTags(selectedTags.includes(tag) ? selectedTags.filter((item) => item !== tag) : [...selectedTags, tag]);
  }

  return <>
    <section className="summary-grid">
      <div className="summary-block"><span>登记人物<strong>{visible.length}</strong></span></div>
      <div className="summary-block"><span>人类选手<strong>{humanCount}</strong></span></div>
      <div className="summary-block"><span>魂天实力玩家<strong>{celestialCount}</strong></span></div>
    </section>
    <section className="section-block person-directory">
      <div className="section-heading">
        <div><h2>排行榜</h2><p>点标签只看对应人群，选择会记住，下次打开还是这批人。</p></div>
        <span className="table-count">当前显示 {visible.length} / {entries.length} 人</span>
      </div>
      {options.length > 0 && <div className={styles.tagFilter} role="group" aria-label="按标签筛选人物">
        <div className={styles.tagChips}>
          <button
            type="button"
            className={selectedTags.length ? styles.tagChip : `${styles.tagChip} ${styles.tagChipActive}`}
            aria-pressed={!selectedTags.length}
            onClick={() => applyTags([])}
          >全部<small>{entries.length}</small></button>
          {options.map(({ tag, count }) => {
            const active = selectedTags.includes(tag);
            return <button
              key={tag}
              type="button"
              className={active ? `${styles.tagChip} ${styles.tagChipActive}` : styles.tagChip}
              aria-pressed={active}
              onClick={() => toggleTag(tag)}
            >{tag}<small>{count}</small></button>;
          })}
        </div>
        <p className={styles.tagFilterMeta}>
          <ListFilter size={12} />
          {selectedTags.length ? `只看 ${selectedTags.join("、")}` : "未筛选，显示全部人物"}
          {selectedTags.length > 0 && <button type="button" className={styles.tagFilterReset} onClick={() => applyTags([])}>清除筛选</button>}
        </p>
      </div>}
      <div className="person-directory-list">
        {visible.map(({ person, estimatedRank, estimatedRankPrecise, matchCount, averageRank, totalCompetitionPoints, recentLuckLevel }) => (
          <article key={person.id} style={{ "--player-color": person.color } as React.CSSProperties}>
            <div className="person-directory-name">
              <PersonAvatar person={person} size="small" />
              <div>
                <strong>{person.displayName}</strong>
                <PersonTags person={person} compact />
                <small>{person.kind === "human" ? "人类" : "AI"} · {person.aliases.slice(0, 3).join(" / ")}</small>
              </div>
            </div>
            <div className={styles.directoryMetrics}>
              <span>总 PT<strong className={totalCompetitionPoints >= 0 ? "positive" : "negative"}>{totalCompetitionPoints >= 0 ? "+" : ""}{totalCompetitionPoints.toFixed(1)}</strong></span>
              <span>半庄<strong>{matchCount}</strong></span>
              <span>平均顺位<strong>{averageRank?.toFixed(2) ?? "-"}</strong></span>
              <span>近期运势{recentLuckLevel ? <strong className={`${luckPillClass} ${luckInlinePillClass} ${luckLevelClass[recentLuckLevel]}`}>{recentLuckLevel}</strong> : <strong>-</strong>}</span>
              <span>推定段位<EstimatedRankValue rank={estimatedRank} precise={estimatedRankPrecise} /></span>
              <span>雀魂段位<MajsoulRankBadge person={person} /></span>
            </div>
            <Link className="icon-link" href={`/players/${encodeURIComponent(person.id)}`} title="查看人物数据" aria-label={`查看${person.displayName}数据`}><ArrowRight /></Link>
          </article>
        ))}
        {!visible.length && <p className={styles.directoryEmpty}>没有符合所选标签的人物</p>}
      </div>
    </section>
  </>;
}
