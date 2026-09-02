import Link from "next/link";
import type { Participant } from "@/domain/types";

export function PlayerTag({ participant, compact = false }: { participant: Participant; compact?: boolean }) {
  const className = `player-tag${compact ? " compact" : ""}`;
  const style = { "--player-color": participant.color } as React.CSSProperties;
  const content = <><i />{participant.displayName}</>;
  return participant.personId
    ? <Link className={className} href={`/players/${participant.personId}`} style={style}>{content}</Link>
    : <span className={className} style={style}>{content}</span>;
}
