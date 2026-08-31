import type { Competition } from "@/domain/types";
import type { CompetitionSummary } from "@/server/competition-statistics";
import { PlayerTag } from "@/components/player-tag";

const rankColors = ["#e3a51a", "#3b91b8", "#8b929a", "#cf5560"];

function pieGradient(counts: number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0) || 1;
  let cursor = 0;
  const stops = counts.map((count, index) => {
    const start = cursor;
    cursor += count / total * 100;
    return `${rankColors[index]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export function RankDistribution({ competition, summary }: { competition: Competition; summary: CompetitionSummary }) {
  return (
    <section className="rank-distribution">
      <div className="rank-section-head">
        <h2>顺位分布</h2>
        <div className="rank-legend">
          {rankColors.map((color, index) => <span key={color}><i style={{ background: color }} />{index + 1}位</span>)}
        </div>
      </div>
      <div className="rank-grid">
        {competition.participants.map((participant) => {
          const rankCounts = [0, 0, 0, 0];
          for (const match of competition.matches) {
            const seat = match.seats.find((item) => item.participantId === participant.id);
            if (seat) rankCounts[seat.rank - 1] += 1;
          }
          const total = rankCounts.reduce((sum, count) => sum + count, 0) || 1;
          const averageRank = summary[participant.id]?.["平均顺位"];
          return (
            <article className="rank-card" key={participant.id} style={{ "--player-color": participant.color } as React.CSSProperties}>
              <div className="rank-card-name"><PlayerTag participant={participant} /></div>
              <div className="rank-card-body">
                <div className="rank-donut-wrap">
                  <div className="rank-donut" style={{ background: pieGradient(rankCounts) }} />
                  <div className="rank-donut-center"><strong>{averageRank?.toFixed(2)}</strong><small>平均顺位</small></div>
                </div>
                <div className="rank-counts">
                  {rankCounts.map((count, index) => (
                    <span key={index}><strong style={{ color: rankColors[index] }}>{count}</strong><small>{index + 1}位 · {(count / total * 100).toFixed(2)}%</small></span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
