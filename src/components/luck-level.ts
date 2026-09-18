import type { LuckLevel } from "@/domain/luck";
import styles from "./person-luck-card.module.css";

/** 运势五档对应的配色，人物页与排行榜共用。 */
export const luckLevelClass: Record<LuckLevel, string> = {
  绝好调: styles.peak,
  好调: styles.good,
  平平无奇: styles.plain,
  恶调: styles.bad,
  极恶调: styles.worst,
};

/** 概况行 / 排行榜里的小胶囊样式。 */
export const luckPillClass = styles.pill;
/** 排行榜等窄列用的紧凑胶囊（只放等级文字，不放分数）。 */
export const luckInlinePillClass = styles.inlinePill;
