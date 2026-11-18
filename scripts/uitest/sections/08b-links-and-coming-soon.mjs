import { BASE, d0, ok } from "../harness.mjs";

// 8b. a saved link opens in a new tab; a movie with a release date joins Coming soon
export default async function linksAndComingSoon(t) {
  const { c, phone, page, film, shot, main, sheet, toast, goView, section } = t;
  const linkUrl = `https://example.com/essay-${c.name}`;
  await page.request.post(BASE + "/api/captures", { data: { kind: "link", body: `Link capture ${c.name}`, url: linkUrl } });
  await page.reload();
  await main.waitFor();
  await goView("Shiny things");
  const linkTile = main.locator(".cap", { hasText: `Link capture ${c.name}` });
  const link = linkTile.locator(`a.caplink[href="${linkUrl}"]`);
  ok("a capture's link is a real link that opens in a new tab", (await link.count()) === 1 && (await link.getAttribute("target")) === "_blank");
  const d10 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 10);
  const inTen = `${d10.getFullYear()}-${String(d10.getMonth() + 1).padStart(2, "0")}-${String(d10.getDate()).padStart(2, "0")}`;
  const filmItem = (await (await page.request.get(BASE + "/api/state")).json()).items.find((i) => i.title === film);
  await page.request.patch(BASE + `/api/items/${filmItem.id}`, { data: { releaseOn: inTen } });
  await page.reload();
  await main.waitFor();
  await goView("Up next");
  //   On Up next, Coming soon is dated lines like Now's (no covers, no Hide on the line), under In Progress
  const soonSec = section("Coming soon");
  const soonFilm = soonSec.locator(".soonlist:not(.hid) .soonline", { hasText: film });
  ok("a movie with a release date shows in Coming soon, saying it comes out", (await soonFilm.count()) === 1 && (await soonFilm.innerText()).includes("Comes out"));
  const heads2 = (await main.locator("h2").allInnerTexts()).map((t) => t.replace(/\s*\d+$/, "").trim());
  ok(`Coming soon sits under In Progress, above Up Next (${heads2.slice(0, 4).join(", ")})`, heads2.slice(0, 4).join() === "In Progress,Coming soon,Up Next,Saved for Later");
  ok("its line leads with the date and has no cover", (await soonFilm.locator(".d").innerText()).length > 0 && !(await soonSec.locator(".cv, img").count()));
  ok("the line carries no Hide (that lives on the item's page)", !(await soonSec.locator("button", { hasText: /^Hide$/ }).count()));
  const upCols = await soonSec.locator(".soonlist").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  ok(`Up next's dated lines run ${phone ? "one to a row on the phone" : "three across"} (${upCols})`, upCols === (phone ? 1 : 3));
  await shot("8-upnext-coming-soon");
  //   a line opens the item; its About tab hides it from Coming soon, with Undo
  await soonFilm.click();
  await sheet.waitFor();
  ok("a Coming soon line opens the item", (await sheet.innerText()).includes(film));
  await sheet.locator(".ipanel:not([hidden]) button", { hasText: "Hide from Coming Soon" }).click();
  await toast.waitFor();
  ok("hiding from the item's page offers Undo", (await toast.innerText()).includes("Undo"));
  const showAgain = sheet.locator(".ipanel:not([hidden]) button", { hasText: "Show again" });
  await showAgain.waitFor();
  ok("the item's page says it's hidden and offers Show again", (await sheet.locator(".soon-field").innerText()).includes("Hidden from Coming Soon"));
  await showAgain.click();
  await sheet.locator(".ipanel:not([hidden]) button", { hasText: "Hide from Coming Soon" }).waitFor();
  ok("Show again on the item's page brings it back", (await soonFilm.count()) === 1);
  await sheet.locator(".ipanel:not([hidden]) button", { hasText: "Hide from Coming Soon" }).click();
  await showAgain.waitFor();
  if (phone) await page.locator('.isheet [aria-label="Close"]').click();
  else await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  //   hidden ones stay reachable on Up next: "Show 1 hidden" lists them dimmed, with Show again
  const hiddenLink = soonSec.locator("button", { hasText: "Show 1 hidden" });
  await hiddenLink.waitFor();
  ok("a hidden one leaves the lines and Up next offers Show 1 hidden", (await soonFilm.count()) === 0);
  await hiddenLink.click();
  const hid = soonSec.locator(".soonhid", { hasText: film });
  await hid.waitFor();
  ok("hidden ones list dimmed", Number(await hid.locator(".soonline").evaluate((el) => getComputedStyle(el).opacity)) < 1);
  await shot("8-upnext-coming-soon-hidden");
  await hid.locator("button", { hasText: "Show again" }).click();
  await soonFilm.waitFor();
  ok("Show again on Up next puts it back among the lines", (await soonSec.locator(".soonhid").count()) === 0 && (await soonSec.locator("button", { hasText: /hidden/ }).count()) === 0);
  //   Dropped leaves Coming soon everywhere, as Not a Fan does; Paused stays
  const soonOn = async (status) => {
    await page.request.patch(BASE + `/api/items/${filmItem.id}`, { data: { status } });
    await page.reload();
    await main.locator("h1", { hasText: "Up next" }).waitFor();
    const up = await main.locator(".soon .soonline", { hasText: film }).count();
    await goView("Now");
    await main.locator(".now").waitFor();
    const now = await main.locator(".now-soon .soonline", { hasText: film }).count();
    await goView("Up next");
    return [up, now].join();
  };
  ok("something Dropped is left out of Coming soon on Up next and on Now", (await soonOn("dropped")) === "0,0");
  ok("with only that dated, Up next draws no Coming soon section", !(await main.locator(".soon").count()));
  ok("something Paused stays in Coming soon on both", (await soonOn("paused")) === "1,1");
  await page.request.patch(BASE + `/api/items/${filmItem.id}`, { data: { status: null } });
  await page.reload();
  await main.waitFor();
  //   Now is one column: Coming soon sits under Watching and above Up Next, its lines three across on desk
  await goView("Now");
  const soonLine = main.locator(".now-soon .soonline", { hasText: film });
  ok("Now's Coming soon lists the movie", await soonLine.waitFor({ timeout: 5000 }).then(() => true, () => false));
  const lay = await page.evaluate(() => {
    const box = (s) => document.querySelector(s)?.getBoundingClientRect();
    const [w, s, n] = [box(".now-watching"), box(".now-soon"), box(".now-new")];
    const covers = [...document.querySelectorAll(".now-watching .poster")].map((p) => p.getBoundingClientRect());
    return {
      stacked: !!w && !!s && !!n && s.top >= w.bottom && n.top >= s.bottom,
      coverW: Math.round(Math.max(0, ...covers.map((r) => r.width))),
      covers: covers.length,
      watchCols: (document.querySelector(".now-watching .posters") ? getComputedStyle(document.querySelector(".now-watching .posters")).gridTemplateColumns.split(" ").length : 0),
      soonCols: getComputedStyle(document.querySelector(".soonlist")).gridTemplateColumns.split(" ").length,
    };
  });
  ok("Coming soon sits under Watching and above Up Next", lay.stacked);
  ok(`its dated lines run ${phone ? "one to a row on the phone" : "three across"} (${lay.soonCols})`, lay.soonCols === (phone ? 1 : 3));
  if (phone) ok(`the phone keeps Watching three across (${lay.watchCols})`, lay.covers === 0 || lay.watchCols === 3);
  else ok(`Watching covers keep one size on desk (${lay.coverW}px wide)`, lay.covers === 0 || (lay.coverW >= 140 && lay.coverW < 200));
  await shot("8-now-coming-soon");
  await page.request.patch(BASE + `/api/items/${filmItem.id}`, { data: { releaseOn: null } });
  ok("no Test copy strip without TEST_COPY", !(await page.locator(".testcopy").count()));
}
