import { BASE, TODAY, ok } from "../harness.mjs";

// 6e. two kinds of items: follow a podcast, pause it, capture from an episode; shows get seasons
export default async function followingAndSeasons(t) {
  const { c, page, film, shot, main, sheet, toast, openAdd, tab, goView, filter, show } = t;
  const podName = `UI Pod ${c.name}`;
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Finished" }).click();
  const finishTypes = await sheet.locator(".chip.type").allInnerTexts();
  ok("Finished offers no podcast or album", !finishTypes.some((t) => /Podcast|Album/.test(t)));
  await sheet.locator(".seg button", { hasText: "Follow" }).click();
  const followTypes = await sheet.locator(".chip.type").allInnerTexts();
  const ft = followTypes.join(",");
  ok("Follow offers podcast, artist, author and TV (no albums or books)", ["Podcast", "Artist", "Author", "TV"].every((t) => ft.includes(t)) && !/Album|Book/.test(ft));
  await sheet.locator(".chip.type", { hasText: "Podcast" }).click();
  await sheet.locator('input[placeholder^="Search"]').fill(podName);
  await sheet.locator("button", { hasText: "Follow it" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  ok("following a new podcast confirms it", (await toast.innerText()).includes(`Following ${podName}`));
  await goView("Library");
  await filter("Podcasts");
  await main.locator(".tile", { hasText: podName }).click();
  await sheet.waitFor();
  const podSheet = await sheet.innerText();
  ok("a followed podcast reads Following, with no finish to log", podSheet.includes("Following") && !/Log it as|Not finished/.test(podSheet));
  ok("a podcast can be marked Ended (they stopped making it)", (await sheet.locator('[aria-label="Status"] button').allInnerTexts()).includes("Ended"));
  await sheet.locator('[aria-label="Status"] button', { hasText: "Paused" }).click();
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Status"] button[aria-checked="true"]')?.textContent === "Paused");
  ok("pause it", true);
  //   a podcast's year (its newest episode's, from the lookup) stays out of the header; the data is kept. Other types show theirs.
  const stPod = await (await page.request.get(BASE + "/api/state")).json();
  const podId = stPod.items.find((i) => i.title === podName).id;
  await page.request.patch(`${BASE}/api/items/${podId}`, { data: { creator: "UI Network", year: 2019 } });
  await page.request.patch(`${BASE}/api/items/${stPod.items.find((i) => i.title === film).id}`, { data: { year: 1999 } });
  await sheet.locator('[aria-label="Status"] button', { hasText: "Following" }).click();
  await page.waitForFunction(() => document.querySelector(".sheet .ihero")?.textContent.includes("UI Network"));
  const podHead = await sheet.locator(".ihero").innerText();
  const podYear = (await (await page.request.get(BASE + "/api/state")).json()).items.find((i) => i.id === podId).year;
  ok("a podcast's header shows who makes it and no year, though the year is kept", podHead.includes("UI Network") && !podHead.includes("2019") && podYear === 2019, JSON.stringify(podHead));
  await shot("5b2-podcast-header");
  await sheet.locator('[aria-label="Status"] button', { hasText: "Paused" }).click();
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Status"] button[aria-checked="true"]')?.textContent === "Paused");
  ok("a followed podcast has no History tab", (await sheet.locator(".itabs button").allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim()).join() === "About,Captures");
  await tab("Captures");
  await sheet.locator("button", { hasText: "+ Capture from an episode" }).click();
  const epSheet = page.locator(".sheet").last();
  await epSheet.locator("textarea").fill(`Episode line ${c.name}`);
  await epSheet.locator("label.field", { hasText: "Episode (optional)" }).locator("input").fill("Ep. 7");
  await epSheet.locator("button", { hasText: "Save capture" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".sheet").length === 1);
  await page.waitForFunction((t) => document.querySelector(".sheet")?.innerText.includes(t), "Ep. 7");
  ok("the capture shows on the podcast with its episode", (await sheet.innerText()).includes(`Episode line ${c.name}`));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await filter("Everything");
  //   the queued show from 6b: caught up, two seasons
  await goView("Up next");
  await main.locator(".poster", { hasText: show }).first().click();
  await sheet.waitFor();
  //   shows go by seasons seen: marking one while Watching keeps it Watching, and the cover says where
  await sheet.locator('[aria-label="Where you are"] button', { hasText: "Watching" }).click();
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Where you are"] button[aria-checked="true"]')?.textContent === "Watching");
  ok("a show has no progress box and no History until it has entries", !(await sheet.getByRole("textbox", { name: "Progress" }).count()) && !(await sheet.getByRole("tab", { name: /History/ }).count()));
  //   Where you are already says Watching, so there's no Queue row under it to say "Not queued"
  ok("a show being watched has no Queue row", !(await sheet.locator('[aria-label="Queue section"]').count()) && !(await sheet.getByText("Not queued").count()));
  await sheet.locator('[aria-label="Seasons seen"] .chip.dash').click();
  // Wait on the lit chip: the "+ S1" button itself also contains "S1".
  await sheet.locator('[aria-label="Seasons seen"] .chip.on', { hasText: "S1" }).waitFor();
  const watchingNow = await sheet.locator('[aria-label="Where you are"] button[aria-checked="true"]').innerText().catch(() => "(none)");
  ok(`marking a season keeps a show Watching, and the header says Through S1 (sheet reads ${watchingNow})`, watchingNow === "Watching" && (await sheet.locator(".ihero").innerText()).includes("Through S1"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  ok("the Watching cover says Through S1", (await main.locator(".poster", { hasText: show }).first().innerText()).includes("Through S1"));
  await main.locator(".poster", { hasText: show }).first().click();
  await sheet.waitFor();
  //   opened from Watching: the Order row names its list, and still no Queue row
  const orderRow = sheet.locator(".field", { hasText: "Move to top" });
  ok("a watched show's Order row reads Order in Watching", /^Order in Watching\s*\d+ of \d+/.test(await orderRow.innerText()), await orderRow.innerText().catch(() => "(no Order row)"));
  ok("and it has no Queue row", !(await sheet.locator('[aria-label="Queue section"]').count()));
  await page.waitForFunction(() => !document.querySelector(".toast"), null, { timeout: 10000 }).catch(() => {});
  await shot("5b-show-watching");
  await sheet.locator('[aria-label="Where you are"] button', { hasText: "Caught up" }).click();
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Where you are"] button[aria-checked="true"]')?.textContent?.startsWith("Caught up"));
  //   no longer Watching: the Queue row is back, truthfully Not queued, and Up Next and Saved for Later are a tap away
  const queueRow = sheet.locator('[aria-label="Queue section"]');
  await queueRow.waitFor();
  ok("once it isn't Watching the Queue row returns: Not queued lit, with Up Next and Saved for Later", (await queueRow.locator(".chip").allInnerTexts()).join() === "Not queued,Up Next,Saved for Later" && (await queueRow.locator(".chip.on").innerText()) === "Not queued");
  await queueRow.locator(".chip", { hasText: "Saved for Later" }).click();
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Queue section"] .chip.on')?.textContent === "Saved for Later");
  ok("from there a show that was Watching moves to Saved for Later", (await (await page.request.get(BASE + "/api/state")).json()).items.some((i) => i.title === show && i.queue === "saved"));
  ok("queued again, its Order row is plain Order", !(await sheet.getByText("Order in Watching").count()));
  await queueRow.locator(".chip", { hasText: "Not queued" }).click();
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Queue section"] .chip.on')?.textContent === "Not queued");
  await sheet.locator('[aria-label="Seasons seen"] .chip.dash').click();
  await sheet.locator('[aria-label="Seasons seen"] .chip.on', { hasText: "S2" }).waitFor();
  const st3 = await (await page.request.get(BASE + "/api/state")).json();
  const showRow = st3.items.find((i) => i.title === show);
  ok(`a show records caught up and seasons seen (${showRow?.status}, ${showRow?.seasonsSeen})`, showRow?.status === "following" && showRow?.seasonsSeen === 2);
  ok("no 'Rewatch' wording on a show", !(await sheet.innerText()).includes("rewatch"));
  await shot("5c-show-seasons");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  //   a show logged before seasons-only (as some in your library are) still opens and lists it, with nothing to log
  await page.request.post(`${BASE}/api/items/${showRow.id}/logs`, { data: { finishedOn: TODAY, detail: "Season 1", keepInQueue: true } });
  await page.goto(`${BASE}/?item=${showRow.id}`);
  await sheet.waitFor();
  const showLast = sheet.locator(".ipanel").first().locator(".field", { hasText: "Last time" });
  ok("a show's earlier entry leads About under Last time, with no button", (await showLast.innerText()).includes("Season 1") && !(await showLast.locator("button").count()));
  await tab("History");
  ok("a show's earlier entry shows under History, with no Log button", (await sheet.innerText()).includes("Season 1") && !(await sheet.locator("button", { hasText: /^Log/ }).count()));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));

  // Later parts use these.
  Object.assign(t, { podName });
}
