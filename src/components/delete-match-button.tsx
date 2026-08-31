"use client";

import { Trash2 } from "lucide-react";
import { deleteCompetitionMatchAction } from "@/app/competitions/[competitionId]/matches/[matchNumber]/actions";

export function DeleteMatchButton({ competitionId, matchNumber }: { competitionId: string; matchNumber: number }) {
  const action = deleteCompetitionMatchAction.bind(null, competitionId, matchNumber);
  function confirmDelete(event: React.MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(`确定删除第 ${matchNumber} 场对局？删除后将重新计算积分和统计。`)) event.preventDefault();
  }
  return (
    <form action={action}>
      <button className="button danger" type="submit" onClick={confirmDelete}><Trash2 size={16} />删除对局</button>
    </form>
  );
}
