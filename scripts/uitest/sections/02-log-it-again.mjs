import { BASE, ok } from "../harness.mjs";

// 2. re-log a rewatch from the item sheet (About's Last time button opens History's form)
export default async function logItAgain(t) {
  const { page, film, sheet, tab, lastTime } = t;
  await tab("About");
  await lastTime.locator("button", { hasText: "Log a rewatch" }).click();
  await sheet.locator(".itabs button.on", { hasText: "History" }).waitFor();
  ok("a new finish in the sheet says Finished today", (await sheet.locator(".subform .dateline").innerText()).includes("Finished today"));
  //   the form asks the tier too (as the + sheet's Finished tab does): optional, lit as the item stands, saved only if you tap
  const formTier = sheet.locator('.subform [aria-label="Tier (optional)"]');
  const formOrder = await sheet.locator(".subform").evaluate((f) => [...f.children].map((el) => (el.matches("textarea") ? "note" : el.querySelector('[aria-label="Tier (optional)"]') ? "tier" : el.textContent.includes("Log it") ? "buttons" : "")).filter(Boolean).join());
  ok("the finish form has a Tier (optional) row between the note and Log it", formOrder === "note,tier,buttons" && (await sheet.locator(".subform .field > span").innerText()) === "Tier (optional)", formOrder);
  ok("its chips are Not a Fan, Love, Fave, Top Shelf, none lit on an unrated film", (await formTier.locator(".chip").allInnerTexts()).map((t) => t.replace("★", "").trim()).join() === "Not a Fan,Love,Fave,Top Shelf" && !(await formTier.locator(".chip.on").count()));
  const tierWrites = [];
  page.on("request", (r) => r.method() === "PATCH" && /\/api\/items\//.test(r.url()) && tierWrites.push(r.url()));
  await formTier.locator(".chip", { hasText: "Love" }).click();
  await formTier.locator(".chip.on", { hasText: "Love" }).waitFor();
  await sheet.locator(".subform button", { hasText: "Cancel" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet .subform"));
  const stCancel = await (await page.request.get(BASE + "/api/state")).json();
  ok("Cancel after tapping a tier changes nothing", tierWrites.length === 0 && stCancel.items.some((i) => i.title === film && i.tier === null && !i.disliked) && stCancel.logs.filter((l) => l.itemId === stCancel.items.find((i) => i.title === film).id).length === 1);
  await sheet.locator(".ipanel:not([hidden]) button", { hasText: "Log a rewatch" }).click();
  ok("reopened, the form is back to the item's own state: nothing lit", !(await formTier.locator(".chip.on").count()));
  await sheet.locator(".subform textarea").fill("Second viewing.");
  await sheet.locator(".subform button", { hasText: "Log it" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".sheet .logrow").length === 2);
  const stUntouched = await (await page.request.get(BASE + "/api/state")).json();
  ok("a finish logged with the tier row left alone sends no tier write", tierWrites.length === 0 && stUntouched.items.some((i) => i.title === film && i.tier === null && !i.disliked), tierWrites.join());
  //   editing an old finish is about that finish: no tier row
  await sheet.locator(".logrow .linkbtn", { hasText: "Edit" }).first().click();
  await sheet.locator(".subform button", { hasText: /^Save$/ }).waitFor();
  ok("editing an old finish shows no tier row", !(await sheet.locator('.subform [aria-label="Tier (optional)"]').count()) && !(await sheet.locator(".subform").innerText()).includes("Tier"));
  await sheet.locator(".subform button", { hasText: "Cancel" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet .subform"));
  ok("item history shows two finishes", (await sheet.locator(".logrow").count()) === 2);
  ok("second finish is labeled Rewatch", (await sheet.locator(".loglist").innerText()).includes("Rewatch"));
}
