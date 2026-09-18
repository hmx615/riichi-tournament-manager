"use client";

import { useState } from "react";
import { EstimatedRankValue } from "@/components/estimated-rank-value";
import { luckLevelClass, luckPillClass } from "@/components/luck-level";
import { PersonLuckCard, type LuckView } from "@/components/person-luck-card";
import type { EstimatedRank } from "@/domain/estimated-rank";
import type { LuckViews } from "@/domain/luck";
import styles from "./person-data-overview.module.css";
import luckStyles from "./person-luck-card.module.css";

/**
 * 人物概况：总 PT / 半庄 / 平均顺位 / 运势 / 推定段位，下面接运势明细。
 * 运势的"近期/长期"开关在这里统一持有状态，概况块和明细表永远一致。
 */
export function PersonSummary({ totalPoints, matchCount, averageRank, rank, preciseRank, luck }: {
  totalPoints: number;
  matchCount: number;
  averageRank: number | null;
  rank: EstimatedRank | null;
  preciseRank: number | null;
  luck: LuckViews | null;
}) {
  const [view, setView] = useState<LuckView>("recent");
  const report = luck ? (view === "recent" ? luck.recent : luck.allTime) : null;
  return (
    <>
      <section className={`summary-grid person-summary ${styles.rankSummary}`} aria-label="人物概况">
        <div className="summary-block"><span>总 PT<strong className={totalPoints >= 0 ? "positive" : "negative"}>{totalPoints >= 0 ? "+" : ""}{totalPoints.toFixed(1)}</strong></span></div>
        <div className="summary-block"><span>半庄<strong>{matchCount}</strong></span></div>
        <div className="summary-block"><span>平均顺位<strong>{averageRank?.toFixed(2) ?? "-"}</strong></span></div>
        <div className="summary-block">
          <span>运势{report && <small className={luckStyles.summaryMeta}>{view === "recent" ? "近 20 半庄" : "全部牌谱"}</small>}
            {report && (
              <strong className={`${luckPillClass} ${luckLevelClass[report.level]}`}>
                {report.level}
                <small>{report.score >= 0 ? "+" : ""}{report.score.toFixed(2)}</small>
              </strong>
            )}
          </span>
        </div>
        <div className="summary-block"><span>推定段位<EstimatedRankValue rank={rank} precise={preciseRank} /></span></div>
      </section>

      {luck && report && (
        <PersonLuckCard report={report} recent={luck.recent} allTime={luck.allTime} view={view} onChange={setView} />
      )}
    </>
  );
}
