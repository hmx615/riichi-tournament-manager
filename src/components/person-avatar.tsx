import type { Person } from "@/domain/types";

export function PersonAvatar({ person, size = "medium" }: { person: Person; size?: "small" | "medium" | "large" }) {
  const initials = person.displayName.replace(/\s+/g, "").slice(0, 2).toUpperCase();
  const className = `person-avatar person-avatar-${size}`;
  const style = { "--player-color": person.color } as React.CSSProperties;
  return <div className={className} style={style}>
    {person.avatarKey
      ? <img src={`/api/avatars/${person.id}?v=${person.avatarVersion || 1}`} alt={`${person.displayName}头像`} />
      : <span aria-label={`${person.displayName}默认头像`}>{initials}</span>}
  </div>;
}
