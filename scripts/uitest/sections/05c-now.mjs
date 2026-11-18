import { BASE, ok } from "../harness.mjs";

// 5c. home is for watching and reading: a type filter stays on Now and says where
//     podcasts live, one tap away; Books shows what you're reading
export default async function now(t) {
  const { phone, page, shot, main, sheet, goView, filter, st } = t;
  await goView("Now");
  await filter("Podcasts");
  await main.locator(".now-elsewhere").waitFor();
  ok("Podcasts on Now stays on Now and just says they live in the Library", (await main.innerText()).includes("Podcasts live in the Library.") && !(await main.innerText()).includes("Now is for what you watch"));
  await main.locator(".now-elsewhere button", { hasText: "Open the Library" }).click();
  // The Library under a type is that type's room, headed with its name.
  await main.locator(".roomtop h1", { hasText: "Podcasts" }).waitFor();
  const pods = st.items.filter((i) => i.type === "podcast").length;
  ok(`its button opens the Library's podcast room with all ${pods}`, (await main.locator(".tile").count()) === pods);
  await goView("Now");
  //   Under Everything, Reading sits right under Watching: books in progress as covers Watching's size, with their progress
  await filter("Everything");
  const books0 = (await (await page.request.get(BASE + "/api/state")).json()).items.filter((i) => i.type === "book");
  const onTheGo = books0.filter((i) => i.queue === "in_progress");
  const waitingBooks = books0.filter((i) => i.queue === "up_next" || i.queue === "saved").length;
  const readingSec = main.locator(".now-reading");
  await readingSec.waitFor();
  ok(`Now has a Reading section with every book in progress (${onTheGo.length})`, onTheGo.length > 0 && (await readingSec.locator(".poster").count()) === onTheGo.length && (await readingSec.locator("h2").innerText()).startsWith("Reading"));
  const withProgress = onTheGo.find((i) => i.progress);
  ok("a book's cover says how far you are, once you've said", !!withProgress && (await readingSec.locator(".poster", { hasText: withProgress.title }).innerText()).includes(withProgress.progress));
  const nowHeads = (await main.locator("h2").allInnerTexts()).map((t) => t.split("\n")[0].replace(/\s*\d+$/, "").trim());
  ok(`Reading sits under Watching and above the rest (${nowHeads.join(", ")})`, nowHeads[0] === "Watching" && nowHeads[1] === "Reading" && nowHeads.at(-1) === "Up Next");
  const coverW = (sel) => page.evaluate((s) => Math.round(document.querySelector(s)?.getBoundingClientRect().width ?? 0), sel);
  const [wW, rW] = [await coverW(".now-watching .poster .cv"), await coverW(".now-reading .poster .cv")];
  ok(`Reading's covers are the size of Watching's (${rW} and ${wW})`, rW > 0 && (wW === 0 || rW === wW));
  ok("no link to Up next under Reading with Everything picked", !(await readingSec.locator(".linkbtn").count()));
  await shot("5c-now-reading");
  await readingSec.locator(".poster", { hasText: onTheGo[0].title }).click();
  await sheet.waitFor();
  ok("a Reading cover opens the book", (await sheet.innerText()).includes(onTheGo[0].title));
  if (phone) await page.locator('.isheet [aria-label="Close"]').click();
  else await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  //   who's watching: Solo keeps books (they're untagged), the label leaves them out
  const nowWatchRow = main.locator(`[aria-label="Filter by who's watching"]`);
  await nowWatchRow.locator(".chip", { hasText: "Solo" }).click();
  await page.waitForTimeout(200);
  ok("Solo keeps Reading", (await readingSec.locator(".poster").count()) === onTheGo.length);
  await nowWatchRow.locator(".chip", { hasText: "With Sam" }).click();
  await page.waitForTimeout(200);
  ok("the label leaves Reading out", (await readingSec.count()) === 0);
  await nowWatchRow.locator(".chip", { hasText: "Everything" }).click();
  //   Books picked: the same Reading section alone, and a quiet link to the books waiting in Up next
  const y0 = await page.evaluate(() => window.scrollY);
  await filter("Books");
  await readingSec.waitFor();
  ok("Books on Now shows Reading alone", (await main.locator("h2").count()) === 1 && (await readingSec.locator(".poster").count()) === onTheGo.length && !(await main.locator(".now-elsewhere").count()));
  const moreLine = waitingBooks === 1 ? "1 more book is waiting in Up next" : `${waitingBooks} more books are waiting in Up next`;
  const more = readingSec.locator(".linkbtn");
  ok(`a quiet link counts the books waiting (${moreLine})`, waitingBooks > 0 && (await more.innerText()) === moreLine);
  if (phone) {
    //   the phone's chip bar scrolls to the lit chip, so Books (off the right edge) shows as picked; the page stays put
    const lit = () =>
      page.evaluate(() => {
        const bar = document.querySelector(".chips-bar");
        const on = bar?.querySelector(".chip.on");
        if (!bar || !on) return null;
        const [b, c] = [bar.getBoundingClientRect(), on.getBoundingClientRect()];
        return { name: on.textContent, inView: c.left >= b.left && c.right <= b.right, y: window.scrollY, side: document.documentElement.scrollWidth <= window.innerWidth };
      });
    await page.waitForFunction(() => {
      const bar = document.querySelector(".chips-bar");
      const c = bar?.querySelector(".chip.on")?.getBoundingClientRect();
      const b = bar?.getBoundingClientRect();
      return !!c && !!b && c.left >= b.left && c.right <= b.right;
    }, null, { timeout: 4000 }).catch(() => {});
    const l1 = await lit();
    ok("with Books picked the lit chip shows in the bar", l1?.name === "Books" && l1.inView);
    ok("the page doesn't scroll or widen", l1?.y === y0 && l1.side);
    await shot("5c-now-books-chip");
    await page.goto(BASE + "/?type=music");
    await main.waitFor();
    await page.waitForTimeout(150);
    const l2 = await lit();
    ok("on first load the lit chip is already in view", l2?.name === "Music" && l2.inView && l2.y === 0);
    await filter("Everything");
    await page.waitForFunction(() => document.querySelector(".chips-bar")?.scrollLeft === 0, null, { timeout: 4000 }).catch(() => {});
    ok("back on Everything the bar returns to its start", (await page.evaluate(() => document.querySelector(".chips-bar").scrollLeft)) === 0);
    //   Back picks Music again with the bar at its start (no tap on the chip), so only the app can bring it into view
    await page.goBack();
    await page.waitForFunction(() => {
      const bar = document.querySelector(".chips-bar");
      const c = bar?.querySelector(".chip.on")?.getBoundingClientRect();
      const b = bar?.getBoundingClientRect();
      return !!c && !!b && bar.scrollLeft > 0 && c.left >= b.left && c.right <= b.right;
    }, null, { timeout: 4000 }).catch(() => {});
    const l3 = await lit();
    ok("a filter change scrolls the bar to the lit chip, and only the bar", l3?.name === "Music" && l3.inView && l3.y === 0 && l3.side);
    await filter("Books");
    await readingSec.waitFor();
  }
  await shot("5c-now-books");
  await more.click();
  await main.locator("h1", { hasText: "Up next" }).waitFor();
  ok("the link opens Up next", true);
  //   one book waiting reads in the singular; none means no link; nothing on the go leaves one line pointing to Up next
  const queuedBooks = books0.filter((i) => i.queue === "up_next" || i.queue === "saved");
  const setQueue = async (list, queue) => {
    for (const i of list) await page.request.patch(BASE + `/api/items/${i.id}`, { data: { queue } });
  };
  await setQueue(queuedBooks.slice(1), null);
  await page.goto(BASE + "/?type=book");
  await readingSec.waitFor();
  ok("one waiting book is worded in the singular", (await more.innerText()) === "1 more book is waiting in Up next");
  await setQueue(queuedBooks.slice(0, 1), null);
  await page.reload();
  await readingSec.waitFor();
  ok("no link when no book is waiting", (await more.count()) === 0);
  for (const i of queuedBooks) await page.request.patch(BASE + `/api/items/${i.id}`, { data: { queue: i.queue } });
  await setQueue(onTheGo, "up_next");
  await page.reload();
  await main.locator(".now-elsewhere").waitFor();
  ok("with no book on the go, Books on Now says your reading lives in Up next", (await main.innerText()).includes("Your reading lives in Up next.") && (await readingSec.count()) === 0);
  await main.locator(".now-elsewhere button", { hasText: "Open Up next" }).click();
  await main.locator("h1", { hasText: "Up next" }).waitFor();
  ok("its button opens Up next", true);
  await goView("Now");
  await filter("Everything");
  await main.locator(".now").waitFor();
  ok("and Now under Everything draws no Reading section", (await readingSec.count()) === 0 && !(await main.locator("h2").allInnerTexts()).some((t) => t.startsWith("Reading")));
  await setQueue(onTheGo, "in_progress");
  for (const i of onTheGo) if (i.progress) await page.request.patch(BASE + `/api/items/${i.id}`, { data: { progress: i.progress } });
  await page.reload();
  await main.waitFor();
}
