import { notFound } from "next/navigation";
import { TutorialReviewQueue } from "@/components/tutorial-review-queue";
import candidates from "@/data/tutorial/one-shanten-candidates.json";
import type { TutorialCandidate } from "@/domain/tutorial-review";
import { requireTutorialReviewerPage } from "@/server/tutorial-auth";
import { listTutorialCaseStates } from "@/server/tutorial-review-repository";

const stages = ["initial", "secondary", "final", "rejected"] as const;

export default async function TutorialStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  if (!stages.includes(stage as (typeof stages)[number])) notFound();
  const reviewer = await requireTutorialReviewerPage(`/tutorials/one-shanten/${stage}`);
  const states = await listTutorialCaseStates();
  return (
    <TutorialReviewQueue
      stage={stage as (typeof stages)[number]}
      candidates={candidates as TutorialCandidate[]}
      storedStates={states}
      reviewerName={reviewer.displayName}
    />
  );
}
