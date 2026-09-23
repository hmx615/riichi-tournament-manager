import Link from "next/link";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getCompetition } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import { StatusPill } from "@/components/status-pill";
import { currentPlayer } from "@/server/player-auth";

export default async function CompetitionMatchesPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  const [admin, player] = await Promise.all([isAdmin(), currentPlayer()]);
  const matches = [...competition.matches].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || b.matchNumber - a.matchNumber);
  return <div className="page data-page"><Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回 {competition.name}</Link><div className="page-heading"><div><p className="eyebrow">{competition.code} · 牌谱</p><h1>牌谱记录</h1></div>{(admin || player) && <Link className="button primary" href={`/competitions/${competition.id}/matches/new`}><FilePlus2 size={17} />录入牌谱</Link>}</div><div className="table-wrap"><table className="match-table"><thead><tr><th>场次</th><th>阶段</th><th>时间</th><th>选手与结果</th><th>状态</th></tr></thead><tbody>{matches.map((match) => <tr key={match.id}><td>#{match.matchNumber}</td><td>{match.stage ?? "-"}{match.round ? ` · 第 ${match.round} 轮` : ""}</td><td>{new Date(match.playedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</td><td>{[...match.seats].sort((a, b) => a.rank - b.rank).map((seat) => `${seat.rank}. ${competition.participants.find((p) => p.id === seat.participantId)?.displayName ?? seat.sourceUsername} ${seat.competitionPoints >= 0 ? "+" : ""}${seat.competitionPoints.toFixed(1)}`).join("　")}</td><td><StatusPill status={match.status} /></td></tr>)}</tbody></table></div></div>;
}
