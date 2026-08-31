import type { Competition } from "@/domain/types";
import type { CompetitionSummary } from "@/server/competition-statistics";
import { PlayerTag } from "@/components/player-tag";

type MetricType = "rate" | "decimal" | "point" | "signed";
type Metric = readonly [field: string, type: MetricType];

const groups: Array<{ title: string; metrics: Metric[] }> = [
  {
    title: "攻守与选择",
    metrics: [
      ["和牌率", "rate"], ["放铳率", "rate"], ["副露率", "rate"], ["立直率", "rate"],
      ["自摸率", "rate"], ["默听率", "rate"], ["流听率", "rate"], ["平均起手向听", "decimal"],
    ],
  },
  {
    title: "打点与效率",
    metrics: [
      ["平均打点", "point"], ["平均铳点", "point"], ["打点效率", "point"], ["铳点损失", "point"],
      ["净打点效率", "signed"], ["和了巡数", "decimal"], ["平均被炸点数", "point"],
    ],
  },
  {
    title: "立直与副露结果",
    metrics: [
      ["立直后和牌率", "rate"], ["副露后和牌率", "rate"], ["立直后放铳率", "rate"], ["副露后放铳率", "rate"],
      ["立直后流局率", "rate"], ["副露后流局率", "rate"], ["先制率", "rate"], ["追立率", "rate"],
    ],
  },
];

function displayValue(value: number | null, type: MetricType) {
  if (value == null || !Number.isFinite(value)) return "-";
  if (type === "rate") return `${(value * 100).toFixed(2)}%`;
  if (type === "decimal") return value.toFixed(2);
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

export function MetricComparison({ competition, summary }: { competition: Competition; summary: CompetitionSummary }) {
  return (
    <div className="data-groups">
      {groups.map((group) => (
        <section className="data-group" key={group.title}>
          <h2>{group.title}</h2>
          <div className="comparison-scroll">
            <div className="comparison-grid">
              <div className="comparison-head">
                <div>指标</div>
                {competition.participants.map((participant) => <div key={participant.id}><PlayerTag participant={participant} compact /></div>)}
              </div>
              {group.metrics.map(([field, type]) => {
                const values = competition.participants.map((participant) => summary[participant.id]?.[field] ?? null);
                const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
                const maxAbsolute = Math.max(...finite.map((value) => Math.abs(value)), 1);
                return (
                  <div className="comparison-row" key={field}>
                    <div className="comparison-label">{field}</div>
                    {competition.participants.map((participant, index) => {
                      const value = values[index];
                      const width = value == null ? 0 : type === "rate" ? Math.max(0, value * 100) : Math.abs(value) / maxAbsolute * 100;
                      return (
                        <div className="comparison-cell" data-player={participant.displayName} key={participant.id} style={{ "--player-color": participant.color } as React.CSSProperties}>
                          <strong>{displayValue(value, type)}</strong>
                          <span><i style={{ width: `${width}%` }} /></span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
