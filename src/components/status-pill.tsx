import type { MatchStatus } from "@/domain/types";

const labels: Record<MatchStatus, string> = {
  scheduled: "待录入",
  processing: "解析中",
  completed: "已完成",
  needs_review: "待确认",
  invalid: "无效",
};

export function StatusPill({ status }: { status: MatchStatus }) {
  return <span className={`status status-${status}`}>{labels[status]}</span>;
}
