import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { DeleteMatchButton } from "@/components/delete-match-button";
import { getCompetition } from "@/server/competition-repository";
import { requireAdminPage } from "@/server/auth";

const winds = ["东", "南", "西", "北"];

export default async function EditMatchPage({ params }: { params: Promise<{ competitionId: string; matchNumber: string }> }) {
  const { competitionId, matchNumber } = await params;
  await requireAdminPage(`/competitions/${competitionId}/matches/${matchNumber}`);
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  const match = competition.matches.find((item) => item.matchNumber === Number(matchNumber));
  if (!match) notFound();
  const participantById = Object.fromEntries(competition.participants.map((participant) => [participant.id, participant]));
  return (
    <div className="page form-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回赛程</Link>
      <div className="page-heading"><div><p className="eyebrow">修改对局</p><h1>第 {match.matchNumber} 场</h1><p>{match.tenhouLogId}</p></div></div>
      <div className="form-layout">
        <section className="form-section">
          <div className="form-section-title"><span>1</span><div><h2>原始牌谱</h2></div></div>
          <div className="seat-editor active">
            {[...match.seats].sort((left, right) => left.seat - right.seat).map((seat) => <div key={seat.seat}><b>{winds[seat.seat]}</b><span className="source-name">{seat.sourceUsername}</span><select aria-label={`${winds[seat.seat]}家身份`} defaultValue={seat.participantId}>{competition.participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.displayName}</option>)}</select><span className="match-state confirmed" style={{ color: participantById[seat.participantId].color }}>当前：{participantById[seat.participantId].displayName}</span></div>)}
          </div>
        </section>
        <div className="match-edit-actions"><DeleteMatchButton competitionId={competition.id} matchNumber={match.matchNumber} /><div><Link className="button" href={`/competitions/${competition.id}`}>取消</Link><button className="button primary" type="button" disabled><Save size={17} />保存修正</button></div></div>
      </div>
    </div>
  );
}
