import { formatEstimatedRank, type EstimatedRank } from "@/domain/estimated-rank";
import styles from "./estimated-rank-value.module.css";

export function EstimatedRankValue({ rank, precise }: { rank: EstimatedRank | null; precise?: number | null }) {
  const label = formatEstimatedRank(rank);
  const exact = precise != null && Number.isFinite(precise) ? precise.toFixed(4) : null;
  if (!exact) return <strong>{label}</strong>;
  return (
    <span className={styles.wrapper} tabIndex={0} aria-label={`推定段位 ${label}，精确值 ${exact}段`}>
      <strong>{label}</strong>
      <span className={styles.tip} aria-hidden="true">精确值 {exact}段</span>
    </span>
  );
}
