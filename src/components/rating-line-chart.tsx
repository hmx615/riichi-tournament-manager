import styles from "./rating-line-chart.module.css";

export type RatingSeries = { id: string; label: string; color: string; values: Array<number | null> };

export function RatingLineChart({ series, title = "NAGA Rating图" }: { series: RatingSeries[]; title?: string }) {
  if (!series.some((item) => item.values.some((value) => value != null && Number.isFinite(value)))) return null;
  const width = 720; const height = 280; const left = 48; const right = 28; const top = 28; const bottom = 34; const count = Math.max(...series.map((item) => item.values.length));
  const x = (index: number) => left + (index / Math.max(1, count - 1)) * (width - left - right);
  const y = (value: number) => height - bottom - ((Math.max(80, Math.min(100, value)) - 80) / 20) * (height - top - bottom);
  return <section className={styles.chart}><div className={styles.heading}><h2>{title}</h2><div>{series.map((item) => <span key={item.id}><i style={{ background: item.color }} />{item.label}</span>)}</div></div><div className={styles.plotLabels}><b>Rating</b><b>半庄数</b></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>{[80, 85, 90, 95, 100].map((tick) => <g key={tick}><line x1={left} y1={y(tick)} x2={width - right} y2={y(tick)} /><text x={left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}{series.map((item) => { const coords = item.values.map((value, index) => value == null ? null : `${x(index)},${y(value)}`).filter(Boolean).join(" "); return <polyline key={item.id} points={coords} fill="none" stroke={item.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />; })}</svg></section>;
}
