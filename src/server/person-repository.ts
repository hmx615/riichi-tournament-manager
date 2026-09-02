import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { Person } from "@/domain/types";
import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";
import { dataDirectory } from "@/server/data-directory";

const peopleFile = path.join(dataDirectory, "people.json");

function validatePersonId(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("人物 ID 格式无效");
}

function parsePerson(document: string) {
  return JSON.parse(document) as Person;
}

export async function listPeople(): Promise<Person[]> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare("SELECT document FROM people ORDER BY created_at, id")
      .all<{ document: string }>();
    return result.results.map((row) => parsePerson(row.document));
  }
  const people = JSON.parse(await fs.readFile(peopleFile, "utf8")) as Person[];
  return people;
}

export async function getPerson(id: string): Promise<Person | null> {
  validatePersonId(id);
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const row = await db.prepare("SELECT document FROM people WHERE id = ?")
      .bind(id)
      .first<{ document: string }>();
    return row ? parsePerson(row.document) : null;
  }
  return (await listPeople()).find((person) => person.id === id) || null;
}

async function writePeople(people: Person[]) {
  const temporary = `${peopleFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(people, null, 2)}\n`, { flag: "wx" });
  try {
    await fs.rename(temporary, peopleFile);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function createPerson(person: Person) {
  validatePersonId(person.id);
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const now = new Date().toISOString();
    try {
      await db.prepare("INSERT INTO people (id, document, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)")
        .bind(person.id, JSON.stringify(person), now, now)
        .run();
      return;
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new Error("人物 ID 已存在");
      throw error;
    }
  }
  const people = await listPeople();
  if (people.some((item) => item.id === person.id)) throw new Error("人物 ID 已存在");
  people.push(person);
  await writePeople(people);
}

export async function updatePerson(person: Person) {
  validatePersonId(person.id);
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const current = await db.prepare("SELECT version FROM people WHERE id = ?")
      .bind(person.id)
      .first<{ version: number }>();
    if (!current) throw new Error("人物不存在");
    const result = await db.prepare("UPDATE people SET document = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(JSON.stringify(person), new Date().toISOString(), person.id, current.version)
      .run();
    if (!result.success || result.meta.changes !== 1) throw new Error("人物数据已被其他操作更新，请刷新后重试");
    return;
  }
  const people = await listPeople();
  const index = people.findIndex((item) => item.id === person.id);
  if (index < 0) throw new Error("人物不存在");
  people[index] = person;
  await writePeople(people);
}
