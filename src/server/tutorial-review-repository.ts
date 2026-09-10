import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { TutorialCaseState } from "@/domain/tutorial-review";
import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";
import { dataDirectory } from "@/server/data-directory";

const localStateFile = path.join(dataDirectory, "tutorial-case-states.json");

export class TutorialReviewConflictError extends Error {}

function parseState(document: string, version?: number) {
  const state = JSON.parse(document) as TutorialCaseState;
  return typeof version === "number" ? { ...state, version } : state;
}

export async function listTutorialCaseStates() {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare("SELECT document, version FROM tutorial_case_states ORDER BY id")
      .all<{ document: string; version: number }>();
    return result.results.map((row) => parseState(row.document, row.version));
  }
  try {
    const document = JSON.parse(await fs.readFile(localStateFile, "utf8")) as Record<string, TutorialCaseState>;
    return Object.values(document);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function getTutorialCaseState(id: string) {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const row = await db.prepare("SELECT document, version FROM tutorial_case_states WHERE id = ?")
      .bind(id)
      .first<{ document: string; version: number }>();
    return row ? parseState(row.document, row.version) : null;
  }
  return (await listTutorialCaseStates()).find((state) => state.id === id) ?? null;
}

async function writeLocalStates(states: TutorialCaseState[]) {
  await fs.mkdir(path.dirname(localStateFile), { recursive: true });
  const document = Object.fromEntries(states.map((state) => [state.id, state]));
  const temporary = `${localStateFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" });
  try {
    await fs.rename(temporary, localStateFile);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function updateTutorialCaseState(nextState: TutorialCaseState, expectedVersion: number) {
  const storedState = { ...nextState, version: expectedVersion + 1 };
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const now = storedState.updatedAt || new Date().toISOString();
    if (expectedVersion === 0) {
      const result = await db.prepare(
        "INSERT INTO tutorial_case_states (id, document, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING",
      ).bind(storedState.id, JSON.stringify(storedState), now, now).run();
      if (!result.success || result.meta.changes !== 1) throw new TutorialReviewConflictError("牌例状态已被其他人更新");
      return storedState;
    }
    const result = await db.prepare(
      "UPDATE tutorial_case_states SET document = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
    ).bind(JSON.stringify(storedState), now, storedState.id, expectedVersion).run();
    if (!result.success || result.meta.changes !== 1) throw new TutorialReviewConflictError("牌例状态已被其他人更新");
    return storedState;
  }

  const states = await listTutorialCaseStates();
  const index = states.findIndex((state) => state.id === storedState.id);
  const currentVersion = index >= 0 ? states[index].version : 0;
  if (currentVersion !== expectedVersion) throw new TutorialReviewConflictError("牌例状态已被其他人更新");
  if (index >= 0) states[index] = storedState;
  else states.push(storedState);
  await writeLocalStates(states);
  return storedState;
}
