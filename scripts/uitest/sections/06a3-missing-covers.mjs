import { BASE, COMBOS, art, ok } from "../harness.mjs";

// 6a3. Missing covers: a broken cover link falls back to the title block; the review sorts matches into sure
//   (ticked), check these (unticked) and no match, and saves only what's ticked. Saved covers stay saved, so the
//   full run is once; the other widths open the review for a look.
export default async function missingCovers(t) {
  const { c, page, shot, main, goView, filter, goSettings } = t;
  const coverSec = main.locator(".setsec", { has: page.locator("h3", { hasText: "Covers" }) });
  const review = page.locator(".sheet.coversheet");
  const group = (name) => review.locator(".cgroup", { has: page.locator("h3", { hasText: name }) });
  //   a found cover that doesn't load: at thumbnail size the block is the band and the type label, no title broken mid-word
  const thumbCheck = async () => {
    const ph = group("Check these").locator(".crow .cv.ph");
    const there = await ph.waitFor({ timeout: 5000 }).then(() => true, () => false);
    const fit = there
      ? await ph.evaluate((el) => {
          const [b, i] = [el.querySelector("b"), el.querySelector("i")];
          const [box, lab] = [el.getBoundingClientRect(), i.getBoundingClientRect()];
          return { title: getComputedStyle(b).display !== "none", label: i.textContent, inside: lab.left >= box.left && lab.right <= box.right && lab.height < 20 };
        })
      : null;
    ok("a missing cover at thumbnail size shows its type label alone, no title", !!fit && !fit.title && fit.label === "Movie" && fit.inside, JSON.stringify(fit));
  };
  if (c.name === COMBOS[0].name) {
    const stCov = await (await page.request.get(BASE + "/api/state")).json();
    const byTitle = (t) => stCov.items.find((i) => i.title === t);
    await page.request.patch(`${BASE}/api/items/${byTitle("Paper Moonrise").id}`, { data: { coverUrl: `${BASE}/no-such-cover.png` } });
    await page.reload();
    await main.waitFor();
    await filter("Movies");
    await goView("Library");
    const moon = main.locator(".tile", { hasText: "Paper Moonrise" }).first();
    ok("a cover link that doesn't load shows the title block", await moon.locator(".cv.ph").waitFor({ timeout: 5000 }).then(() => true, () => false));
    await filter("Everything");
    await goSettings();
    ok("Covers says how many have none", /\d+ things have no cover/.test(await coverSec.innerText()));
    await coverSec.locator("button", { hasText: "Find covers" }).click();
    await review.locator(".hint", { hasText: "Looked up" }).waitFor({ timeout: 60000 });
    const names = async (g) => (await group(g).locator(".crow-text b, .res b").allInnerTexts()).join("|");
    const goodNames = await names("Good matches");
    ok("good matches: title plus author, Apple Books for a book, a show with one exact match", ["Small Hours in the Orchard", "Weather for Beginners", "Ember & Ash"].every((t) => goodNames.includes(t)), goodNames);
    ok("a film matched on title alone waits under Check these", (await names("Check these")).includes("The Quiet Heist"));
    const noneNames = await names("No match found");
    ok("a different author is no match", noneNames.includes("The Glass Cartographer"), noneNames);
    ok("the broken link is listed, saying so", (await group("No match found").innerText()).includes("its cover link doesn't load"));
    ok("good matches start ticked, the rest not", (await group("Good matches").locator('[role="checkbox"][aria-checked="false"]').count()) === 0 && (await group("Check these").locator('[role="checkbox"][aria-checked="true"]').count()) === 0);
    await thumbCheck();
    const saveBtn = review.locator(".sheet-foot .btn");
    ok("Save counts the ticked ones", (await saveBtn.innerText()) === "Save 3 covers", await saveBtn.innerText());
    await group("Check these").locator('[role="checkbox"]').first().click();
    ok("ticking one more counts it", (await saveBtn.innerText()) === "Save 4 covers");
    await group("Check these").locator('[role="checkbox"]').first().click();
    await shot("5a4-covers-review");
    await saveBtn.click();
    await page.locator(".toast", { hasText: "Saved 3 covers" }).waitFor();
    const stSaved = await (await page.request.get(BASE + "/api/state")).json();
    const after = (t) => stSaved.items.find((i) => i.title === t);
    ok(
      "saving sets only the ticked covers",
      after("Small Hours in the Orchard").coverUrl === art("orchard") && after("Weather for Beginners").coverUrl === art("weather") && after("Ember & Ash").coverUrl === art("ember") && after("The Quiet Heist").coverUrl === null,
    );
    ok("saved ones leave the review; the rest stay", !(await group("Good matches").count()) && (await group("Check these").count()) === 1);
    await page.keyboard.press("Escape");
    ok("nothing ticked, so closing doesn't ask", await page.waitForFunction(() => !document.querySelector(".coversheet"), null, { timeout: 3000 }).then(() => true, () => false));
    await page.request.patch(`${BASE}/api/items/${byTitle("Paper Moonrise").id}`, { data: { coverUrl: null } });
  } else {
    await goSettings();
    await coverSec.locator("button", { hasText: "Find covers" }).click();
    await review.locator(".hint", { hasText: "Looked up" }).waitFor({ timeout: 60000 });
    ok("the review opens and finishes", (await group("Check these").count()) === 1);
    await thumbCheck();
    await shot("5a4-covers-review");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".coversheet"));
  }
  await goView("Library");
  await filter("Everything");
  await goView("Up next");
}
