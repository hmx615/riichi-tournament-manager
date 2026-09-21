"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { deleteCasualAction } from "@/app/casual/actions";

function DeleteButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button danger-button" type="submit" disabled={pending} title={`删除 ${label} 的散排记录`} aria-label={`删除 ${label} 的散排记录`}>
      <Trash2 size={14} />{pending ? "删除中" : "删除"}
    </button>
  );
}

export function DeleteCasualRecordForm({ recordId, label }: { recordId: string; label: string }) {
  return (
    <form action={deleteCasualAction} onSubmit={(event) => {
      if (!window.confirm(`确定删除这条散排记录吗？（${label}）删除后统计会重新计算。`)) event.preventDefault();
    }}>
      <input name="recordId" type="hidden" value={recordId} />
      <DeleteButton label={label} />
    </form>
  );
}
