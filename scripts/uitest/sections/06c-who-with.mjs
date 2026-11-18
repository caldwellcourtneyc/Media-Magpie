import { ok } from "../harness.mjs";

// 6c. Everything / Solo / With someone: tag a show from its sheet, then filter Up next and Now
export default async function whoWith(t) {
  const { page, book, shot, main, sheet, goView, filter, flick, show } = t;
  const watchRow = main.locator(`[aria-label="Filter by who's watching"]`);
  ok("the who's-watching chips read Everything, Solo, the label", (await watchRow.locator(".chip").allInnerTexts()).join() === "Everything,Solo,With Sam");
  await main.locator(".poster", { hasText: show }).click();
  await sheet.waitFor();
  ok("a show starts as Solo", (await sheet.locator('[aria-label="Who with"] .chip.on').innerText()) === "Solo");
  await sheet.locator('[aria-label="Who with"] .chip', { hasText: "With Sam" }).click();
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Who with"] .chip.on')?.textContent === "With Sam");
  ok("the with-someone tag isn't repeated under Tags", !(await sheet.innerText()).includes("Tags: With Sam"));
  await shot("6c-sheet-who-with");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await watchRow.locator(".chip", { hasText: "With Sam" }).click();
  await page.waitForTimeout(200);
  const withRow = await main.innerText();
  ok("With someone keeps the tagged show and hides the rest", withRow.includes(show) && !withRow.includes(flick) && !withRow.includes(book));
  await shot("6c-upnext-with");
  await goView("Now");
  await main.locator(".poster", { hasText: show }).waitFor();
  ok("the chip carries over to Now", (await main.locator(`[aria-label="Filter by who's watching"] .chip.on`).innerText()) === "With Sam" && !(await main.innerText()).includes(flick));
  await shot("6c-now-with");
  await main.locator(`[aria-label="Filter by who's watching"] .chip`, { hasText: "Solo" }).click();
  await page.waitForTimeout(200);
  const soloNow = await main.innerText();
  ok("Solo is everything not tagged", soloNow.includes(flick) && !soloNow.includes(show));
  await page.reload();
  await main.waitFor();
  ok("the chip survives a reload", (await main.locator(`[aria-label="Filter by who's watching"] .chip.on`).innerText()) === "Solo");
  await goView("Up next");
  await filter("Books");
  ok("books have no who's-watching chips", !(await watchRow.count()));
  await main.locator(".poster", { hasText: book }).waitFor();
  ok("and Solo doesn't narrow them", true);
  await filter("Everything");
  await watchRow.locator(".chip", { hasText: "Everything" }).click();
}
