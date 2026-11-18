import { BASE, ok } from "../harness.mjs";

// 7b. nothing typed is thrown away
// Escape asks in the sheet, with buttons that say what they do; the test answers by name.
// A person never presses Escape within milliseconds of typing.
export default async function drafts(t) {
  const { c, page, film, shot, main, sheet, openAdd, tab } = t;
  const escapeAndAnswer = async (answer) => {
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    const ask = sheet.locator(".sheet-ask");
    const asked = await ask.waitFor({ timeout: 2000 }).then(() => true, () => false);
    if (asked) await ask.getByRole("button", { name: answer }).click();
    return asked;
  };
  //   editing a capture, then Escape: asks first; keeping it keeps the edit
  await main.locator(".cap", { hasText: `Standalone line ${c.name}` }).click();
  await sheet.locator("textarea").first().fill(`Standalone line ${c.name} edited`);
  const asked1 = await escapeAndAnswer("Keep editing");
  ok("Escape on an edited capture asks before discarding", asked1 && (await sheet.locator("textarea").first().inputValue()).endsWith("edited"));
  await escapeAndAnswer("Throw it away");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  ok("discarding the edit leaves the saved capture as it was", !(await main.innerText()).includes(`Standalone line ${c.name} edited`));
  //   a log save that can't reach the app keeps the form and the note
  await main.locator(".cap", { hasText: `Attached line ${c.name}` }).click();
  await tab("History");
  await sheet.locator(".ipanel:not([hidden]) button", { hasText: "Log a rewatch" }).click();
  //   a rewatch of something rated opens with its tier lit; Not a Fan and a tier exclude each other here too
  const rewatchTier = sheet.locator('.subform [aria-label="Tier (optional)"]');
  ok("a rewatch of a Top Shelf film opens with Top Shelf lit", (await rewatchTier.locator(".chip.on").allInnerTexts()).map((t) => t.replace("★", "").trim()).join() === "Top Shelf");
  await rewatchTier.locator(".chip", { hasText: "Not a Fan" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.sheet .subform [aria-label="Tier (optional)"] .chip.on')].map((x) => x.textContent).join() === "Not a Fan");
  ok("tapping Not a Fan in the form unlights the tier", true);
  await shot("7b-rewatch-tier");
  await sheet.locator(".subform textarea").fill("Kept after a failed save.");
  await page.route("**/api/items/*/logs", (r) => r.abort());
  await sheet.locator(".subform button", { hasText: "Log it" }).click();
  const offline = await page.locator(".toast", { hasText: "didn't save" }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  ok("an offline save says it didn't save", offline);
  ok("the form stays open with the note", (await sheet.locator(".subform textarea").inputValue()) === "Kept after a failed save.");
  await page.unroute("**/api/items/*/logs");
  const asked2 = await escapeAndAnswer("Throw it away");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  ok("closing the item with an unsaved note asks first", asked2);
  ok("a failed save and a thrown-away form leave the tier as it was", (await (await page.request.get(BASE + "/api/state")).json()).items.some((i) => i.title === film && i.tier === "top" && !i.disliked));
  //   typing a title already in the log adds to that item instead of making a twin
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Finished" }).click();
  await sheet.locator(".chip.type", { hasText: "Movie" }).click();
  await sheet.locator('input[placeholder^="Search"]').fill(film);
  ok("on the Finished tab a match already logged reads Log again", (await sheet.locator(".res", { hasText: film }).first().locator(".act").innerText()) === "Log again");
  await sheet.locator("button", { hasText: "Log it as watched" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  const st2 = await (await page.request.get(BASE + "/api/state")).json();
  const twins = st2.items.filter((i) => i.title === film);
  ok(`retyping an existing title logs on the same item (${twins.length} item, ${st2.logs.filter((l) => l.itemId === twins[0]?.id).length} finishes)`, twins.length === 1 && st2.logs.filter((l) => l.itemId === twins[0].id).length === 3);
  ok("and keeps its Top Shelf tier", twins[0]?.tier === "top");
}
