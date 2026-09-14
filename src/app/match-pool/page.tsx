import { redirect } from "next/navigation";
import { getOrCreateMatchPool } from "@/server/competition-repository";

export default async function MatchPoolPage() {
  const competition = await getOrCreateMatchPool();
  redirect(`/competitions/${competition.id}`);
}
