import { ok } from "../harness.mjs";

// 6b. streaming service on a queued show, then filter by it
export default async function streamingServices(t) {
  const { c, page, book, shot, main, sheet, openAdd } = t;
  const show = `UI Show ${c.name}`;
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Queue" }).click();
  await sheet.locator(".chip.type", { hasText: "TV" }).click();
  ok("TV keeps its capitals in the title box: Search TV titles, or type your own", (await sheet.locator('input[placeholder^="Search"]').getAttribute("placeholder")) === "Search TV titles, or type your own");
  await sheet.locator('input[placeholder^="Search"]').fill(show);
  await sheet.locator(".chip", { hasText: "Up Next" }).click();
  ok("Where to watch appears for a TV show in Up Next", await sheet.locator(".field", { hasText: "Where to watch" }).isVisible());
  ok("a TV show isn't offered Theater", !(await sheet.locator('[aria-label="Streaming services"] .chip', { hasText: "Theater" }).count()));
  await sheet.locator('[aria-label="Streaming services"] .chip', { hasText: "Peacock" }).click();
  await sheet.locator("button", { hasText: "Add to Up Next" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await main.locator(".poster", { hasText: show }).waitFor();
  ok("queued show shows its service", (await main.locator(".poster", { hasText: show }).innerText()).includes("Peacock"));
  await main.locator('[aria-label="Filter by streaming service"] .chip', { hasText: "Peacock" }).click();
  await page.waitForTimeout(200);
  const onPeacock = await main.innerText();
  ok("filtering by service keeps the show and hides the book", onPeacock.includes(show) && !onPeacock.includes(book));
  await main.locator('[aria-label="Filter by streaming service"] .chip', { hasText: "Any service" }).click();
  //   a movie can be marked Theater, and the filter row gives a theater list
  const flick = `UI Flick ${c.name}`;
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Queue" }).click();
  await sheet.locator(".chip.type", { hasText: "Movie" }).click();
  await sheet.locator('input[placeholder^="Search"]').fill(flick);
  await sheet.locator(".chip", { hasText: "Up Next" }).click();
  await sheet.locator('[aria-label="Streaming services"] .chip', { hasText: "Theater" }).click();
  await shot("6b-theater-picker");
  await sheet.locator("button", { hasText: "Add to Up Next" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await main.locator(".poster", { hasText: flick }).waitFor();
  ok("a theater movie's tile says Theater", (await main.locator(".poster", { hasText: flick }).innerText()).includes("Theater"));
  await main.locator('[aria-label="Filter by streaming service"] .chip', { hasText: "Theater" }).click();
  await page.waitForTimeout(200);
  const onTheater = await main.innerText();
  ok("the Theater filter keeps the movie and hides the show", onTheater.includes(flick) && !onTheater.includes(show));
  await main.locator('[aria-label="Filter by streaming service"] .chip', { hasText: "Any service" }).click();

  // Later parts use these.
  Object.assign(t, { flick, show });
}
