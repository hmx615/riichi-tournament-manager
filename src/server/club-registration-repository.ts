import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { ClubRegistration, ClubRegistrationInput } from "@/domain/club-registration";
import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";
import { dataDirectory } from "@/server/data-directory";

const registrationsFile = path.join(dataDirectory, "club-registrations.json");

async function localRegistrations(): Promise<ClubRegistration[]> {
  try {
    const registrations = JSON.parse(await fs.readFile(registrationsFile, "utf8")) as ClubRegistration[];
    return registrations.map((registration) => ({
      ...registration,
      otherPlatformRank: registration.otherPlatformRank || "",
      majsoulNickname: registration.majsoulNickname || "",
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalRegistrations(registrations: ClubRegistration[]) {
  const temporary = `${registrationsFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(registrations, null, 2)}\n`, { flag: "wx" });
  try {
    await fs.rename(temporary, registrationsFile);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function fromRow(row: {
  id: string;
  student_id: string;
  nickname: string;
  qq: string;
  majsoul_id: string;
  majsoul_nickname: string;
  current_rank: string;
  other_platform_rank: string;
  goals: string;
  created_at: string;
}): ClubRegistration {
  return {
    id: row.id,
    studentId: row.student_id,
    nickname: row.nickname,
    qq: row.qq,
    otherPlatformRank: row.other_platform_rank,
    majsoulNickname: row.majsoul_nickname,
    majsoulId: row.majsoul_id,
    currentRank: row.current_rank as ClubRegistration["currentRank"],
    goals: row.goals,
    ownsMajsoulAccount: true,
    privacyConsent: true,
    createdAt: row.created_at,
  };
}

export async function createClubRegistration(input: ClubRegistrationInput) {
  const registration: ClubRegistration = {
    id: crypto.randomUUID(),
    studentId: input.studentId,
    nickname: input.nickname,
    qq: input.qq,
    otherPlatformRank: input.otherPlatformRank,
    majsoulNickname: input.majsoulNickname,
    majsoulId: input.majsoulId,
    currentRank: input.currentRank,
    goals: input.goals,
    ownsMajsoulAccount: true,
    privacyConsent: true,
    createdAt: new Date().toISOString(),
  };

  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    try {
      await db.prepare(`
        INSERT INTO club_registrations
          (id, student_id, nickname, qq, majsoul_id, majsoul_nickname, current_rank, other_platform_rank, goals, account_ownership_confirmed, privacy_consent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
      `).bind(
        registration.id,
        registration.studentId,
        registration.nickname,
        registration.qq,
        registration.majsoulId,
        registration.majsoulNickname,
        registration.currentRank,
        registration.otherPlatformRank,
        registration.goals,
        registration.createdAt,
      ).run();
      return registration;
    } catch (error) {
      const message = String(error).toLowerCase();
      if (message.includes("student_id")) throw new Error("该学号已提交过信息");
      if (message.includes("majsoul_id")) throw new Error("该雀魂 ID 已提交过信息");
      if (message.includes("unique")) throw new Error("该学号或雀魂 ID 已提交过信息");
      throw error;
    }
  }

  const registrations = await localRegistrations();
  if (registrations.some((item) => item.studentId.toLowerCase() === registration.studentId.toLowerCase())) {
    throw new Error("该学号已提交过信息");
  }
  if (registrations.some((item) => item.majsoulId.toLowerCase() === registration.majsoulId.toLowerCase())) {
    throw new Error("该雀魂 ID 已提交过信息");
  }
  registrations.push(registration);
  await writeLocalRegistrations(registrations);
  return registration;
}

export async function listClubRegistrations(): Promise<ClubRegistration[]> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare(`
      SELECT id, student_id, nickname, qq, majsoul_id, majsoul_nickname, current_rank, other_platform_rank, goals, created_at
      FROM club_registrations ORDER BY created_at DESC
    `).all<{
      id: string;
      student_id: string;
      nickname: string;
      qq: string;
      majsoul_id: string;
      majsoul_nickname: string;
      current_rank: string;
      other_platform_rank: string;
      goals: string;
      created_at: string;
    }>();
    return result.results.map(fromRow);
  }
  return (await localRegistrations()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function deleteClubRegistration(id: string) {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare("DELETE FROM club_registrations WHERE id = ?").bind(id).run();
    if (!result.success) throw new Error("删除登记信息失败");
    return result.meta.changes === 1;
  }
  const registrations = await localRegistrations();
  const remaining = registrations.filter((registration) => registration.id !== id);
  if (remaining.length === registrations.length) return false;
  await writeLocalRegistrations(remaining);
  return true;
}
