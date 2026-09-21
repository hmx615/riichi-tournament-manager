import type { Person } from "@/domain/types";
import { formatMajsoulRank, majsoulRankDivision, majsoulRankTier, type MajsoulRankTier } from "@/domain/majsoul-rank";
import styles from "./majsoul-rank-badge.module.css";

const iconByTier: Record<MajsoulRankTier, string> = {
  初心: "/majsoul-ranks/novice.png",
  雀士: "/majsoul-ranks/adept.png",
  雀杰: "/majsoul-ranks/expert.png",
  雀豪: "/majsoul-ranks/master.png",
  雀圣: "/majsoul-ranks/saint.png",
  魂天: "/majsoul-ranks/celestial.png",
};

export function MajsoulRankBadge({ person }: { person: Pick<Person, "majsoulRank" | "majsoulCelestialLevel"> }) {
  if (!person.majsoulRank) return <strong className={styles.empty}>-</strong>;
  const tier = majsoulRankTier(person.majsoulRank);
  const division = majsoulRankDivision(person.majsoulRank);
  const label = formatMajsoulRank(person.majsoulRank, person.majsoulCelestialLevel);
  return (
    <strong className={`${styles.badge} ${tier === "魂天" ? styles.celestial : ""}`} title={`雀魂段位：${label}`} aria-label={`雀魂段位：${label}`}>
      <img src={iconByTier[tier]} alt="" width={40} height={40} />
      <span className={styles.suffix}>{tier === "魂天" ? `Lv.${person.majsoulCelestialLevel ?? "-"}` : division}</span>
    </strong>
  );
}
