import { z } from "zod";
import candidates from "@/data/tutorial/one-shanten-candidates.json";
import {
  initialTutorialCaseState,
  transitionTutorialCase,
  type TutorialCandidate,
} from "@/domain/tutorial-review";
import { currentTutorialReviewer } from "@/server/tutorial-auth";
import {
  getTutorialCaseState,
  TutorialReviewConflictError,
  updateTutorialCaseState,
} from "@/server/tutorial-review-repository";

const candidateIds = new Set((candidates as TutorialCandidate[]).map((candidate) => candidate.id));
const bodySchema = z.object({
  action: z.enum([
    "initial_pass",
    "initial_reject",
    "secondary_pass",
    "secondary_reject",
    "return_initial",
    "restore_initial",
    "restore_secondary",
    "return_secondary",
  ]),
  note: z.string().max(500).default(""),
  expectedVersion: z.number().int().min(0),
});

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const reviewer = await currentTutorialReviewer();
  if (!reviewer) return Response.json({ error: "登录已失效，请重新登录" }, { status: 401 });
  const { caseId } = await params;
  if (!candidateIds.has(caseId)) return Response.json({ error: "牌例不存在" }, { status: 404 });
  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "请求数据格式无效" }, { status: 400 });
  }
  try {
    const current = await getTutorialCaseState(caseId) ?? initialTutorialCaseState(caseId);
    if (current.version !== input.expectedVersion) throw new TutorialReviewConflictError("牌例状态已被其他人更新");
    const next = transitionTutorialCase(current, input.action, reviewer.id, input.note);
    return Response.json({ state: await updateTutorialCaseState(next, input.expectedVersion) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    const status = error instanceof TutorialReviewConflictError || message.includes("状态已变化") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
