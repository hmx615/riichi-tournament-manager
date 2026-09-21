"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { deleteRegistrationAction } from "@/app/join/responses/actions";
import styles from "@/app/join/join.module.css";

function DeleteButton({ nickname }: { nickname: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={styles.deleteButton} type="submit" disabled={pending} title={`删除 ${nickname} 的登记信息`} aria-label={`删除 ${nickname} 的登记信息`}>
      <Trash2 size={15} />
    </button>
  );
}

export function DeleteRegistrationForm({ id, nickname }: { id: string; nickname: string }) {
  return (
    <form action={deleteRegistrationAction} onSubmit={(event) => {
      if (!window.confirm(`确定删除“${nickname}”的登记信息吗？删除后不会在列表中保留。`)) event.preventDefault();
    }}>
      <input name="registrationId" type="hidden" value={id} />
      <DeleteButton nickname={nickname} />
    </form>
  );
}
