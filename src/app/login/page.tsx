import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isAdmin } from "@/server/auth";
import { currentPlayer } from "@/server/player-auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const nextPath = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  const [admin, player] = await Promise.all([isAdmin(), currentPlayer()]);
  if (admin || player) redirect(admin || nextPath !== "/" ? nextPath : "/casual");
  return <div className="login-page"><LoginForm nextPath={nextPath} /></div>;
}
