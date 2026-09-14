const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
require("@next/env").loadEnvConfig(process.cwd());
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const base = process.env.TEST_BASE_URL || "http://localhost:3001";
  const source = JSON.parse(await fs.readFile("data/competitions/1st-cccp213e.json", "utf8"));
  const id = "individual-regression-" + Date.now();
  const test = structuredClone(source);
  test.id = id; test.name = "个人赛录入回归测试";
  test.participants.forEach((p) => { delete p.personId; });
  test.individualSchedule.forEach((table) => { table.id = table.id.replace(source.id, id); });
  test.matches.forEach((match) => { match.id = match.id.replace(source.id, id); match.scheduleId = match.scheduleId.replace(source.id, id); });
  const file = path.resolve("data/competitions", id + ".json");
  await fs.writeFile(file, JSON.stringify(test), { flag: "wx" });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.TEST_CHROMIUM_PATH ? { executablePath: process.env.TEST_CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const payload = Buffer.from(JSON.stringify({ version: 1, role: "admin", expiresAt: Date.now() + 3600000 })).toString("base64url");
    const signature = createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
    await context.addCookies([{ name: "xrc_admin_session", value: payload + "." + signature, url: base, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const visit = async (route) => {
      const response = await page.goto(base + route);
      assert.equal(response.status(), 200, route);
      await page.locator("h1").waitFor();
      assert(!page.url().includes("/login"), "Admin session must be active");
    };
    await visit("/competitions/" + id);
    assert.equal(await page.getByText("已录入牌谱", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "录入牌谱", exact: true }).count(), 7);
    for (let index = 1; index < 8; index++) {
      await visit("/competitions/" + id + "/matches/new?scheduleId=" + test.individualSchedule[index].id);
      await page.getByRole("button", { name: "雀魂 JSON", exact: true }).click();
      const fixture = path.resolve("data/logs/individual-test-preliminary", "preliminary-" + String(index + 1).padStart(2, "0") + ".json");
      if (index === 2) {
        await page.locator('input[type="file"]').setInputFiles(path.resolve("data/logs/individual-test-preliminary/preliminary-02.json"));
        await page.getByRole("button", { name: "解析并检查", exact: true }).click();
        await page.getByText("该牌谱属于其他已录入对局，不能录入当前桌次", { exact: true }).waitFor();
        assert.equal(JSON.parse(await fs.readFile(file, "utf8")).matches.length, 2);
      }
      await page.locator('input[type="file"]').setInputFiles(fixture);
      await page.getByRole("button", { name: "解析并检查", exact: true }).click();
      await page.locator('select[name="participant0"]:enabled').waitFor();
      for (const [seat, participantId] of test.individualSchedule[index].participantIds.entries()) {
        const select = page.locator('select[name="participant' + seat + '"]');
        assert.equal(await select.locator('option[value]:not([value=""])').count(), 4);
        await select.selectOption(participantId);
      }
      await page.getByRole("button", { name: "确认录入并计算", exact: true }).click();
      await page.waitForURL(base + "/competitions/" + id);
      await page.getByRole("heading", { name: test.name, exact: true }).waitFor();
      assert.equal(await page.getByText("已录入牌谱", { exact: true }).count(), index + 1);
      assert.equal(await page.getByRole("link", { name: "录入牌谱", exact: true }).count(), 7 - index);
      console.log("Imported game", index + 1, "and verified schedule card");
    }
    const stored = JSON.parse(await fs.readFile(file, "utf8"));
    assert.equal(stored.matches.length, 8);
    for (const table of stored.individualSchedule) {
      assert.equal(table.status, "completed");
      const match = stored.matches.find((m) => m.scheduleId === table.id);
      assert.deepEqual(match.seats.map((s) => s.participantId).sort(), [...table.participantIds].sort());
    }
    for (const route of ["/data", "/matches", "/schedule", ...stored.participants.map((p) => "/data/" + p.id)]) {
      await visit("/competitions/" + id + route);
      assert(!/NaN|Infinity/.test(await page.locator("body").innerText()), route);
      if (route === "/data") {
        const rows = page.locator("table").first().locator("tbody tr");
        assert.equal(await rows.count(), 8);
        for (const participant of stored.participants) {
          const row = rows.filter({ hasText: participant.displayName });
          const points = stored.matches.flatMap((m) => m.seats).filter((s) => s.participantId === participant.id).reduce((sum, s) => sum + s.competitionPoints, 0);
          assert.equal(await row.locator("td").nth(2).innerText(), (points >= 0 ? "+" : "") + points.toFixed(1));
          assert.equal(await row.locator("td").nth(3).innerText(), "4");
        }
      }
      if (route.startsWith("/data/")) {
        const games = page.locator("tbody tr").filter({ has: page.getByRole("cell", { name: "对局数", exact: true }) });
        assert.equal(await games.locator("td").nth(1).innerText(), "4");
      }
    }
    await visit("/competitions/" + source.id);
    await page.screenshot({ path: "/tmp/individual-schedule-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/individual-schedule-mobile.png", fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    console.log("PASS: seven consecutive imports, duplicate rejection, table bindings, overview, schedule, records, eight player data pages, mobile width");
  } finally {
    if (browser) await browser.close();
    await fs.rm(file, { force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
