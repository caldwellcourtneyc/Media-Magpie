import { BASE, TODAY, ok } from "../harness.mjs";

// 4b. the right rail (desk): the + sheet laid open on every page, Queue first, no focus on load.
// It folds away and remembers that. The phone has no rail; its + opens the sheet.
export default async function addRail(t) {
  const { c, phone, page, shot, goView, filter } = t;
  const panel = page.locator(".addrail");
  if (phone) {
    ok("the phone has no Add rail", !(await panel.isVisible()));
  } else {
    ok("the rail's tabs are Queue, Finished, Follow, Shiny things", (await panel.locator(".seg button").allInnerTexts()).join(",") === "Queue,Finished,Follow,Shiny things");
    ok("the rail opens on Queue, its box reading Search TV titles", await panel.locator('input[placeholder="Search TV titles, or type your own"]').isVisible());
    ok("the nav's Add something button gives way to the rail", !(await page.locator(".nav .add").isVisible()));
    await page.reload();
    await panel.waitFor();
    ok("loading a page takes no focus", await page.evaluate(() => document.activeElement === document.body));
  }
  const panelShow = `UI Panel ${c.name}`;
  if (!phone) {
    await panel.locator('input[placeholder^="Search"]').fill(panelShow);
    await panel.locator("button", { hasText: "Add to Up Next" }).click();
    await page.locator(".toast", { hasText: panelShow }).waitFor();
    const stp = await (await page.request.get(BASE + "/api/state")).json();
    ok("queueing from the panel adds the show to Up Next", stp.items.some((i) => i.title === panelShow && i.type === "tv" && i.queue === "up_next"));
    ok("the panel's form starts fresh after a save", (await panel.locator('input[placeholder^="Search"]').inputValue()) === "");
    // The Shiny things tab is the + sheet's full capture form.
    await panel.locator(".seg button", { hasText: "Shiny things" }).click();
    const line = panel.locator("textarea").first();
    ok("picking Shiny things puts the cursor in the line", await line.evaluate((el) => el === document.activeElement));
    ok(
      "the panel's capture form is the full one (kinds, find, the standalone link, link)",
      (await panel.locator('[aria-label="Kind"] .chip').allInnerTexts()).length === 4 &&
        (await panel.locator('input[placeholder="Find something in your log"]').isVisible()) &&
        (await panel.locator("button", { hasText: "Not in your log? Say where it's from" }).isVisible()) &&
        !(await panel.locator('input[placeholder="Show, book, site"]').count()) &&
        (await panel.locator('input[placeholder="https://"]').isVisible())
    );
    const railSave = await panel.locator(".capsave .btn").boundingBox();
    ok(`the rail's Save is on screen without scrolling (bottom at ${Math.round(railSave.y + railSave.height)} of ${c.h})`, railSave.y >= 0 && railSave.y + railSave.height <= c.h);
    await line.fill(`Home line ${c.name}`);
    await page.reload();
    await panel.waitFor();
    ok("a typed line survives a reload, back on Shiny things", (await panel.locator("textarea").first().inputValue()) === `Home line ${c.name}`);
    const srcChip = panel.locator('[aria-label="In progress or recently captured from"] .chip').first();
    const srcName = (await srcChip.count()) ? (await srcChip.innerText()).trim() : null;
    if (srcName) await srcChip.click();
    await panel.locator("button", { hasText: "Save capture" }).click();
    await page.locator(".toast", { hasText: "Captured" }).first().waitFor();
    await page.waitForFunction(() => !document.querySelector(".addrail textarea")?.value);
    const stq = await (await page.request.get(BASE + "/api/state")).json();
    const hc = stq.captures.find((x) => x.body === `Home line ${c.name}`);
    ok(`a rail capture saves on ${srcName ?? "nothing"}, dated today`, !!hc && hc.capturedOn === TODAY && (!srcName || stq.items.find((i) => i.id === hc.itemId)?.title === srcName));
    ok("the form empties after saving", (await panel.locator("textarea").first().inputValue()) === "");
    await page.reload();
    await panel.waitFor();
    ok("a saved line leaves no draft behind", (await panel.locator(".seg button.on").innerText()).trim() === "Queue");
    //   it follows the page: Shiny things opens it on the capture tab, a type filter on that type
    await goView("Shiny things");
    await panel.locator(".seg button.on", { hasText: "Shiny things" }).waitFor();
    ok("on Shiny things the rail opens on the capture tab", true);
    await panel.locator(".seg button", { hasText: "Queue" }).click();
    await filter("Books");
    // Waits for the rail to follow (reading it the instant the filter is clicked raced, 2026-10-20).
    const railOnBook = await panel.locator(".chip.type.on", { hasText: "Book" }).waitFor({ timeout: 3000 }).then(() => true, () => false);
    ok("a Books filter starts the rail on Book", railOnBook);
    await filter("Everything");
    //   it folds to a strip, stays folded after a reload, and opens again
    await panel.locator(".railhead .iconbtn").click();
    await page.reload();
    await page.locator(".addrail.folded").waitFor();
    ok("the rail stays folded after a reload", !(await panel.locator(".seg").count()));
    await page.locator(".railopen").click();
    await panel.locator(".seg").waitFor();
    ok("the strip opens it again", true);
    await goView("Now");
    await shot("3b-now-rail");
  }
}
