import type { Competition, NagaRating } from "@/domain/types";
import { PlayerTag } from "@/components/player-tag";

type RatingSummary = { rating: number; agreementRate: number; badMoveRate: number } | null;

function summarize(ratings: NagaRating[]): RatingSummary {
  const valid = ratings.filter((item) => Number.isFinite(item.rating) && Number.isFinite(item.agreementRate) && Number.isFinite(item.badMoveRate) && item.decisionCount > 0);
  const decisionCount = valid.reduce((sum, item) => sum + item.decisionCount, 0);
  if (!decisionCount) return null;
  return {
    rating: valid.reduce((sum, item) => sum + item.rating, 0) / valid.length,
    agreementRate: valid.reduce((sum, item) => sum + item.agreementRate * item.decisionCount, 0) / decisionCount,
    badMoveRate: valid.reduce((sum, item) => sum + item.badMoveRate * item.decisionCount, 0) / decisionCount,
  };
}

export function NagaRatingComparison({ competition }: { competition: Competition }) {
  const ratings = competition.matches.flatMap((match) => match.nagaRatings || []);
  const availableModels = new Set(ratings.map((item) => item.model));
  const preferredModels = ["ニシキ", "カガシ"];
  const models = [
    ...preferredModels.filter((model) => availableModels.has(model)),
    ...[...availableModels].filter((model) => !preferredModels.includes(model)).sort(),
  ];
  if (!models.length) return null;

  return (
    <section className="data-group naga-rating-group" id="naga-rating">
      <h2>NAGA Rating 与一致率</h2>
      <div className="comparison-scroll">
        <div className="comparison-grid naga-rating-grid">
          <div className="comparison-head">
            <div>模型</div>
            {competition.participants.map((participant) => <div key={participant.id}><PlayerTag participant={participant} compact /></div>)}
          </div>
          {models.map((model) => (
            <div className="comparison-row" key={model}>
              <div className="comparison-label">{model}</div>
              {competition.participants.map((participant) => {
                const summary = summarize(ratings.filter((item) => item.participantId === participant.id && item.model === model));
                return (
                  <div
                    className="comparison-cell naga-rating-cell"
                    data-player={participant.displayName}
                    key={participant.id}
                    style={{ "--player-color": participant.color } as React.CSSProperties}
                  >
                    {summary ? (
                      <strong className="naga-rating-value">
                        <span>Rating:{summary.rating.toFixed(2)}</span>
                        <span>一致率:{(summary.agreementRate * 100).toFixed(2)}%</span>
                        <span>恶手率:{(summary.badMoveRate * 100).toFixed(2)}%</span>
                      </strong>
                    ) : <strong className="naga-rating-value">-</strong>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
