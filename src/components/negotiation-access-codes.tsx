"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { generateAccessCodesAction, type AccessCodesState } from "@/app/competitions/[competitionId]/schedule/actions";

const initialState: AccessCodesState = { error: "", codes: [] };

export function NegotiationAccessCodes({ competitionId, participants, generated }: {
  competitionId: string;
  participants: Array<{ id: string; displayName: string }>;
  generated: boolean;
}) {
  const [state, action, pending] = useActionState(generateAccessCodesAction, initialState);
  const nameById = new Map(participants.map((participant) => [participant.id, participant.displayName]));
  return <div className="negotiation-codes">
    <div className="negotiation-codes-heading">
      <b><KeyRound size={13} /> 本届选手口令</b>
      <span>{generated ? `已生成（${participants.length} 人各一条 8 位口令，本届通用）` : "尚未生成，选手现在无法提交"}</span>
    </div>
    <form action={action}>
      <input type="hidden" name="competitionId" value={competitionId} />
      <button className="button" type="submit" disabled={pending}>{pending ? "正在生成" : generated ? "重新生成本届全部口令" : "生成本届口令"}</button>
    </form>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.codes.length > 0 && <>
      <p className="field-note">口令只显示这一次，请连同协商链接分别发给本人；忘记可以让管理员重新生成（旧的立即失效）。</p>
      <ul className="negotiation-code-list">
        {state.codes.map((item) => <li key={item.participantId}>
          <strong>{nameById.get(item.participantId) ?? item.participantId}</strong>
          <code>{item.code}</code>
        </li>)}
      </ul>
    </>}
  </div>;
}
