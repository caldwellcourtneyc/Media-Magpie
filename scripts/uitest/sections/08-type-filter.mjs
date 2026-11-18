import { ok } from "../harness.mjs";

// 8. filter every view by type
export default async function typeFilter(t) {
  const { c, page, film, book, shot, main, goView, filter } = t;
  await filter("Books");
  await page.waitForTimeout(200);
  ok("Captures filtered to Books hides the movie capture", !(await main.innerText()).includes(`Attached line ${c.name}`));
  for (const v of ["Now", "Library", "Up next"]) {
    await goView(v);
    await page.waitForTimeout(250);
    const t = await main.innerText();
    ok(`${v} filtered to Books hides the movie`, !t.includes(film));
  }
  ok("Up next filtered to Books still shows the book", (await main.innerText()).includes(book));
  ok("under Books, In Progress reads Reading", (await main.locator("h2").allInnerTexts()).some((t) => t.startsWith("Reading")));
  await filter("Movies");
  await goView("Library");
  await page.waitForTimeout(250);
  ok("Library filtered to Movies shows the movie", (await main.innerText()).includes(film));
  await shot("7-filter-movies");
  await filter("Everything");
}
