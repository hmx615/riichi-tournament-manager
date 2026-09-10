import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createTutorialSessionToken, verifyAdminPassword, verifyTutorialSessionToken } from "@/domain/admin-auth";
import {
  tutorialReviewerById,
  tutorialReviewerByLogin,
  type TutorialReviewerId,
} from "@/domain/tutorial-review";

const sessionCookieName = "xrc_tutorial_session";
const sessionLifetimeSeconds = 7 * 24 * 60 * 60;

function configuration() {
  const secret = process.env.AUTH_SECRET;
  const hashes: Record<TutorialReviewerId, string | undefined> = {
    hmx: process.env.TUTORIAL_HMX_PASSWORD_HASH,
    phq: process.env.TUTORIAL_PHQ_PASSWORD_HASH,
    ezy: process.env.TUTORIAL_EZY_PASSWORD_HASH,
    wdj: process.env.TUTORIAL_WDJ_PASSWORD_HASH,
  };
  if (!secret || secret.length < 32 || Object.values(hashes).some((hash) => !hash)) return null;
  return { secret, hashes: hashes as Record<TutorialReviewerId, string> };
}

export function tutorialAuthConfigured() {
  return configuration() !== null;
}

export async function authenticateTutorialReviewer(login: string, password: string) {
  const config = configuration();
  const reviewer = tutorialReviewerByLogin(login);
  if (!config || !reviewer) return null;
  return await verifyAdminPassword(password, config.hashes[reviewer.id], config.secret) ? reviewer : null;
}

export async function createTutorialSession(reviewerId: TutorialReviewerId) {
  const config = configuration();
  if (!config || !tutorialReviewerById(reviewerId)) throw new Error("牌例筛选账号尚未配置");
  const expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, await createTutorialSessionToken(config.secret, reviewerId, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.AUTH_COOKIE_SECURE !== "false"),
    path: "/",
    maxAge: sessionLifetimeSeconds,
    priority: "high",
  });
}

export async function clearTutorialSession() {
  (await cookies()).delete(sessionCookieName);
}

export async function currentTutorialReviewer() {
  const config = configuration();
  if (!config) return null;
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return null;
  const reviewerId = await verifyTutorialSessionToken(token, config.secret);
  return reviewerId ? tutorialReviewerById(reviewerId) : null;
}

export async function requireTutorialReviewerPage(returnPath: string) {
  const reviewer = await currentTutorialReviewer();
  if (reviewer) return reviewer;
  const safePath = returnPath.startsWith("/tutorials/") && !returnPath.startsWith("//")
    ? returnPath
    : "/tutorials/one-shanten/initial";
  redirect(`/tutorials/login?next=${encodeURIComponent(safePath)}`);
}
