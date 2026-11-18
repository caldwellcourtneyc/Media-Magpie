import { ok } from "../harness.mjs";

// 7. standalone capture
export default async function standaloneCapture(t) {
  const { c, phone, page, film, shot, main, sheet, openAdd, goView } = t;
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Shiny things" }).click();
  await sheet.locator("textarea").fill(`Standalone line ${c.name}`);
  //   the standalone fields wait behind one link under the From search, and Save is in reach either way
  const whereBox = sheet.locator('input[placeholder="Show, book, site"]');
  const standaloneLink = sheet.locator("button", { hasText: "Not in your log? Say where it's from" });
  const saveInReach = async () => {
    const b = await sheet.locator(".capsave .btn").boundingBox();
    const s = await sheet.boundingBox();
    return b.y >= s.y && b.y + b.height <= Math.min(c.h, s.y + s.height);
  };
  ok(
    "the standalone fields start folded behind one link",
    (await standaloneLink.isVisible()) && !(await whereBox.count()) && !(await sheet.locator('[aria-label="Media type (optional)"]').count()) && !(await sheet.innerText()).includes("Who said it")
  );
  ok("Save is on screen without scrolling", await saveInReach());
  await standaloneLink.click();
  ok(
    "the link opens where, who and the type chips in place, the cursor in Where",
    (await whereBox.evaluate((el) => el === document.activeElement)) &&
      (await sheet.locator("label.field", { hasText: "Who said it" }).locator("input").isVisible()) &&
      (await sheet.locator('[aria-label="Media type (optional)"] .chip').count()) === 5 &&
      !(await standaloneLink.count())
  );
  ok("Save is still on screen with them open", await saveInReach());
  await sheet.locator(".sheet-body").evaluate((el) => (el.scrollTop = el.scrollHeight));
  const lastGap = await sheet.locator(".capsave").evaluate((el) => Math.round(el.getBoundingClientRect().top - el.previousElementSibling.getBoundingClientRect().bottom));
  ok(`scrolled to the end, Save sits after the last field (${lastGap}px below it)`, lastGap >= 0);
  await whereBox.fill("A website");
  //   attaching something and changing your mind doesn't fold them away or drop what was typed
  await sheet.locator('input[placeholder="Find something in your log"]').fill(film);
  await sheet.locator(".res", { hasText: film }).first().click();
  await sheet.locator(".picked .linkbtn", { hasText: "Change" }).click();
  ok("a typed Where survives attaching and un-attaching, still open", (await whereBox.inputValue()) === "A website" && !(await standaloneLink.count()));
  await sheet.locator("button", { hasText: "Save capture" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await goView("Shiny things");
  const caps = await main.innerText();
  ok("standalone capture shows with its source", caps.includes(`Standalone line ${c.name}`) && caps.includes("A website"));
  ok("attached capture shows with the item title", caps.includes(`Attached line ${c.name}`) && caps.includes(film));
  //   the header's + Capture: not drawn on desk, where the rail is the open capture form; mid width and the phone keep it
  const capAdd = main.locator(".viewhead button", { hasText: "+ Capture" });
  if (phone) {
    ok("the phone keeps + Capture in the Shiny things header", await capAdd.isVisible());
    await capAdd.click();
    await sheet.waitFor();
    ok("it opens the capture form", (await sheet.locator(".sheet-head h2").innerText()) === "Capture" && (await sheet.locator(".seg button.on").innerText()).trim() === "Shiny things");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet"));
  } else {
    ok("on desk Shiny things has no + Capture button: the rail is the form", !(await capAdd.isVisible()) && (await page.locator(".addrail").isVisible()));
    await page.setViewportSize({ width: 1000, height: c.h });
    ok("at mid width, with no rail, + Capture is there", await capAdd.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false) && !(await page.locator(".addrail").isVisible()));
    await page.setViewportSize({ width: c.w, height: c.h });
    await page.locator(".addrail").waitFor({ state: "visible" });
  }
  await shot("6-captures");
  //   opened again, a capture that says where it's from has those fields open, nothing behind the link
  await main.locator(".cap", { hasText: `Standalone line ${c.name}` }).click();
  await sheet.locator('input[placeholder="Show, book, site"]').waitFor();
  ok(
    "an opened standalone capture shows its Where, already open",
    (await sheet.locator('input[placeholder="Show, book, site"]').inputValue()) === "A website" && !(await sheet.locator("button", { hasText: "Not in your log?" }).count())
  );
  await sheet.locator('input[placeholder="Show, book, site"]').fill("");
  ok("clearing Where to retype it doesn't fold the field away", (await sheet.locator('input[placeholder="Show, book, site"]').evaluate((el) => el === document.activeElement)) && !(await sheet.locator("button", { hasText: "Not in your log?" }).count()));
  await sheet.locator('input[placeholder="Show, book, site"]').fill("A website");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
}
