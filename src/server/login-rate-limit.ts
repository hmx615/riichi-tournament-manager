import "server-only";

import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";

type Attempt = { failures: number; blockedUntil: number };

const localAttempts = new Map<string, Attempt>();
const failureLimit = 5;
const blockDurationMs = 15 * 60 * 1000;

export async function loginIsBlocked(address: string, now = Date.now()) {
  if (!usesD1Storage()) return (localAttempts.get(address)?.blockedUntil || 0) > now;
  const db = await tournamentDatabase();
  const row = await db.prepare("SELECT blocked_until FROM login_attempts WHERE address = ?")
    .bind(address)
    .first<{ blocked_until: number }>();
  return (row?.blocked_until || 0) > now;
}

export async function recordLoginFailure(address: string, now = Date.now()) {
  if (!usesD1Storage()) {
    const current = localAttempts.get(address);
    const failures = current?.blockedUntil && current.blockedUntil <= now ? 1 : (current?.failures || 0) + 1;
    localAttempts.set(address, { failures, blockedUntil: failures >= failureLimit ? now + blockDurationMs : 0 });
    return;
  }
  const db = await tournamentDatabase();
  const current = await db.prepare("SELECT failures, blocked_until FROM login_attempts WHERE address = ?")
    .bind(address)
    .first<{ failures: number; blocked_until: number }>();
  const failures = current?.blocked_until && current.blocked_until <= now ? 1 : (current?.failures || 0) + 1;
  const blockedUntil = failures >= failureLimit ? now + blockDurationMs : 0;
  await db.prepare(
    "INSERT INTO login_attempts (address, failures, blocked_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(address) DO UPDATE SET failures = excluded.failures, blocked_until = excluded.blocked_until, updated_at = excluded.updated_at",
  ).bind(address, failures, blockedUntil, now).run();
}

export async function clearLoginFailures(address: string) {
  if (!usesD1Storage()) {
    localAttempts.delete(address);
    return;
  }
  const db = await tournamentDatabase();
  await db.prepare("DELETE FROM login_attempts WHERE address = ?").bind(address).run();
}
