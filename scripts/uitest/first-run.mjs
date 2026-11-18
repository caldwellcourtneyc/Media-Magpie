// 0. First run: an empty library shows a welcome with three first steps and a faint shelf of examples.
import fs from "node:fs";
import path from "node:path";
import { BASE, COMBOS, EXAMPLES, PASSWORD, ROOT, SHOTS, ok } from "./harness.mjs";

export default async function firstRun(browser, c) {
  console.log(`\n== first run, ${c.name} (${c.w}x${c.h}, ${c.scheme})`);
  const phone = c.w < 860;
  const lastCombo = c === COMBOS.at(-1);
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, colorScheme: c.scheme, hasTouch: phone });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${c.name}-${n}.png`) });
  const main = page.locator("main.main");
  const sheet = page.locator(".sheet").last();
  const welcome = main.locator(".welcome");
  await page.goto(BASE + "/login");
  const loginText = await page.locator(".login-card").innerText();
  ok("a local copy's sign-in page says the password is in .env.local, without showing it", loginText.includes("The password is in .env.local") && !loginText.includes(PASSWORD));
  if (c === COMBOS[0]) await shot("0-login");
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/");
  await welcome.waitFor();
  const getJson = async (p) => (await page.request.get(BASE + p)).json();
  if (c === COMBOS[0]) {
    const h = await getJson("/api/health");
    ok(`a fresh database with no seed file starts empty (seeded from: ${h.seed})`, h.seed === "none" && h.rows.items === 0 && h.rows.logs === 0 && h.rows.captures === 0);
  }
  ok("an empty library's Now is the welcome", (await welcome.locator("h1").innerText()) === "Your library is empty." && !(await main.locator(".now").count()));
  ok("it offers three first steps and the demo", (await welcome.locator(".welcome-acts .btn").allInnerTexts()).join() === "Add a show,Queue something,Capture a line" && (await welcome.locator(".linkbtn").innerText()) === "Or load a small demo library to look around");
  //   the ghost shelf: examples from lib/examples.ts, out of reach, their covers looked up after the page is up
  const ghost = welcome.locator(".ghostshelf");
  ok(`the ghost shelf shows every example title (${EXAMPLES.length})`, EXAMPLES.length >= 8 && (await ghost.locator(".poster > b").allInnerTexts()).join("|") === EXAMPLES.map((e) => e.title).join("|"));
  ok("it says they are examples", (await welcome.locator(".ghost-note").innerText()) === "These are examples. Your first add replaces them.");
  const reach = await ghost.evaluate((el) => ({ hidden: el.getAttribute("aria-hidden"), inert: el.inert, pe: getComputedStyle(el).pointerEvents, faint: Number(getComputedStyle(el).opacity), controls: el.querySelectorAll("button, a, input").length }));
  ok("the examples are aria-hidden, inert, faint and hold nothing to press", reach.hidden === "true" && reach.inert === true && reach.pe === "none" && reach.faint < 0.5 && reach.controls === 0);
  const oneRow = await ghost.locator(".poster").evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  ok("they sit in one row, and the page doesn't scroll sideways", oneRow === 1 && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await ghost.locator('img[src*="c=ghost"]').waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForFunction((n) => document.querySelectorAll(".ghostshelf .cv.ph").length === n - 1, EXAMPLES.length, { timeout: 8000 }).catch(() => {});
  ok("a title the lookup finds gets its cover; the rest keep the missing-cover tile", (await ghost.locator('img[src*="c=ghost"]').count()) === 1 && (await ghost.locator(".cv.ph").count()) === EXAMPLES.length - 1);
  const held = JSON.stringify(await getJson("/api/state")) + JSON.stringify(await getJson("/api/export"));
  ok("example titles are in no state or export, and the library still holds nothing", EXAMPLES.every((e) => !held.includes(`"${e.title}"`)) && (await getJson("/api/state")).items.length === 0);
  if (!phone) ok("the nav counts nothing", (await page.locator(".nav .it .n").first().innerText()) === "0");
  await shot("0-welcome");
  //   each first step opens the Add form on its tab: the rail on desk, the + sheet elsewhere
  const form = phone ? sheet : page.locator(".addrail");
  const formState = async () => ({
    tab: await form.locator('[role="tab"][aria-selected="true"]').innerText(),
    type: (await form.locator(".chip.type.on").count()) ? await form.locator(".chip.type.on").first().innerText() : null,
    section: (await form.locator('[aria-label="Queue section"] [aria-checked="true"]').count()) ? await form.locator('[aria-label="Queue section"] [aria-checked="true"]').innerText() : null,
  });
  const closeForm = async () => {
    if (!phone) return;
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet"));
  };
  const step = async (label) => {
    await welcome.locator(".welcome-acts .btn", { hasText: label }).click();
    if (phone) await sheet.waitFor();
    else await page.waitForTimeout(150);
    return formState();
  };
  if (!phone) {
    await page.locator('.addrail [aria-label="Fold Add something away"]').click();
    await page.locator(".addrail.folded").waitFor();
  }
  const cap = await step("Capture a line");
  ok(`Capture a line opens the Shiny things tab${phone ? "" : ", unfolding the rail"}`, cap.tab === "Shiny things" && (phone || !(await page.locator(".addrail.folded").count())) && (phone || !(await page.locator(".sheet").count())));
  await closeForm();
  const que = await step("Queue something");
  ok("Queue something opens the Queue tab, on Up Next", que.tab === "Queue" && que.section === "Up Next");
  await closeForm();
  const sho = await step("Add a show");
  ok("Add a show opens the Queue tab on TV, with In Progress picked", sho.tab === "Queue" && sho.type === "TV" && sho.section === "In Progress");
  await shot("0-welcome-add-a-show");
  //   the first add replaces the welcome and the examples
  const first = `First Show ${c.name}`;
  await form.locator('input[placeholder^="Search"]').fill(first);
  await form.locator("button", { hasText: "Add to In Progress" }).click();
  await main.locator(".now-watching .poster", { hasText: first }).waitFor();
  ok("adding one thing replaces the welcome and the ghost shelf with Now", !(await main.locator(".welcome, .ghostshelf").count()) && (await main.locator(".now").count()) === 1);
  await page.reload();
  await main.locator(".now-watching .poster", { hasText: first }).waitFor();
  ok("and they stay gone after a reload", !(await main.locator(".welcome, .ghostshelf").count()));
  //   (emptied again so the next size starts from the same place: deletes are soft, the welcome shows for an empty library)
  const mine = (await getJson("/api/state")).items;
  for (const i of mine) await page.request.delete(BASE + `/api/items/${i.id}`);
  await page.reload();
  await welcome.waitFor();
  if (lastCombo) {
    await welcome.locator(".linkbtn", { hasText: "load a small demo library" }).click();
    await main.locator(".now").waitFor();
    const demo = JSON.parse(fs.readFileSync(path.join(ROOT, "seed/demo.json"), "utf8"));
    const after = await getJson("/api/state");
    ok(`loading the demo fills the library (${after.items.length} items) and the welcome goes away`, after.items.length === demo.items.length && !(await main.locator(".welcome, .ghostshelf").count()));
    await shot("0-demo-loaded");
    const refused = await page.request.post(BASE + "/api/demo", { data: {} });
    ok("the demo is refused once the library has things in it", refused.status() === 400 && (await getJson("/api/state")).items.length === after.items.length);
  }
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
