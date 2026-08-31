import type { Participant } from "@/domain/types";

export function PlayerTag({ participant, compact = false }: { participant: Participant; compact?: boolean }) {
  return (
    <span
      className={`player-tag${compact ? " compact" : ""}`}
      style={{ "--player-color": participant.color } as React.CSSProperties}
    >
      <i />{participant.displayName}
    </span>
  );
}
