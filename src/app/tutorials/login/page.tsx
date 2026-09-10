import { redirect } from "next/navigation";
import { TutorialLoginForm } from "@/components/tutorial-login-form";
import { currentTutorialReviewer } from "@/server/tutorial-auth";

export default async function TutorialLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = typeof params.next === "string"
    && params.next.startsWith("/tutorials/")
    && !params.next.startsWith("//")
    ? params.next
    : "/tutorials/one-shanten/initial";
  if (await currentTutorialReviewer()) redirect(nextPath);
  return <main className="tutorial-login-page"><TutorialLoginForm nextPath={nextPath} /></main>;
}
