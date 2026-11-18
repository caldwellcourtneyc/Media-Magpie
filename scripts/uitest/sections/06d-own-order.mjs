import { BASE, ok } from "../harness.mjs";

// 6d. your own order: Move to top, up and down in the sheet, drag where there's a mouse
export default async function ownOrder(t) {
  const { c, phone, page, book, shot, main, sheet, openAdd, goView, flick, section, show } = t;
  const upNext = section("Up Next");
  const titles = async () => (await upNext.first().locator(".poster > b").allInnerTexts()).filter((t) => t === show || t === flick || t === book);
  const inOrder = (want) =>
    page
      .waitForFunction(
        ([mine, w]) => {
          const sec = [...document.querySelectorAll("main section")].find((x) => x.querySelector("h2")?.textContent.startsWith("Up Next"));
          return [...(sec?.querySelectorAll(".poster > b") ?? [])].map((b) => b.textContent).filter((t) => mine.includes(t)).join("|") === w.join("|");
        },
        [[show, flick, book], want],
        { timeout: 5000 }
      )
      .then(() => true, () => false);
  const start = await titles();
  ok(`newest first before any move (${start.join(", ")})`, start[0] === flick && start[1] === show);
  await main.locator(".poster", { hasText: show }).click();
  await sheet.waitFor();
  ok("the sheet says where it stands", /Order\s*\d+ of \d+/.test(await sheet.locator(".field", { hasText: "Move to top" }).innerText()));
  await sheet.locator(".chip", { hasText: "Move to top" }).click();
  ok("Move to top", await inOrder([show, flick, ...start.slice(2)]));
  ok("at the top, Move up and Move to top rest", await sheet.locator(".chip", { hasText: "Move up" }).isDisabled());
  await shot("6d-sheet-order");
  await sheet.locator(".chip", { hasText: "Move down" }).click();
  ok("Move down", await inOrder([flick, show, ...start.slice(2)]));
  await sheet.locator(".chip", { hasText: "Move up" }).click();
  ok("Move up", await inOrder([show, flick, ...start.slice(2)]));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await page.reload();
  await main.waitFor();
  ok("the order survives a reload", await inOrder([show, flick, ...start.slice(2)]));
  if (phone) {
    ok("no dragging on a touch screen", !(await main.locator('.poster[draggable="true"]').count()));
  } else {
    const from = main.locator(".poster", { hasText: flick });
    const onto = main.locator(".poster", { hasText: show });
    const box = await onto.boundingBox();
    await from.dragTo(onto, { targetPosition: { x: 8, y: box.height / 2 } });
    ok("dragging a cover onto another's left side lands before it", await inOrder([flick, show, ...start.slice(2)]));
    const toBack = await onto.boundingBox();
    await onto.dragTo(from, { targetPosition: { x: 8, y: toBack.height / 2 } });
    ok("and back", await inOrder([show, flick, ...start.slice(2)]));
  }
  //   a queued movie can be finished from About: the button opens History's form, and the finish leaves the queue
  await main.locator(".poster", { hasText: flick }).click();
  await sheet.waitFor();
  const aboutLog = sheet.locator('.ipanel:not([hidden]) button', { hasText: "Log it as watched" });
  ok("a queued movie's About tab offers Log it as watched", (await aboutLog.count()) === 1);
  ok("with no finish and no capture, About has no Last time or Shiny things", !(await sheet.locator(".ipanel").first().getByText(/Last time|Shiny things/).count()));
  // Let the sheet settle and the add toasts clear, so the shot shows the button uncovered at phone width.
  await page.waitForFunction(() => !document.querySelector(".toast"), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  await shot("6c-about-log");
  await aboutLog.click();
  await sheet.locator(".itabs button.on", { hasText: "History" }).waitFor();
  ok("it opens the finish form on History", await sheet.locator(".subform").isVisible());
  //   finishing from the queue is where tiers went missing: a tier tapped here saves with the finish, and not before
  const flickTier = sheet.locator('.subform [aria-label="Tier (optional)"]');
  ok("an unrated queued movie's finish form lights no tier", (await flickTier.locator(".chip").count()) === 4 && !(await flickTier.locator(".chip.on").count()));
  await flickTier.locator(".chip", { hasText: "Love" }).click();
  await flickTier.locator(".chip", { hasText: "Fave" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.sheet .subform [aria-label="Tier (optional)"] .chip.on')].map((x) => x.textContent).join() === "Fave");
  ok("nothing is saved until Log it", (await (await page.request.get(BASE + "/api/state")).json()).items.some((i) => i.title === flick && i.tier === null));
  await shot("6d-finish-form-tier");
  await sheet.locator(".subform button", { hasText: "Log it" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".sheet .logrow").length === 1);
  const st6 = await (await page.request.get(BASE + "/api/state")).json();
  const flickItem = st6.items.find((i) => i.title === flick);
  ok("the tier tapped in the finish form is saved with the finish", flickItem?.tier === "fave" && flickItem?.disliked === false, `${flickItem?.tier}`);
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Tier"] .chip.on')?.textContent === "Fave");
  ok("and About's Tier row shows it", true);
  ok("the finish is logged and the movie leaves Up next", !!flickItem && flickItem.queue === null && st6.logs.some((l) => l.itemId === flickItem.id));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  //   with nothing set, a show defaults to its network when that's one of your services: shown, never stored
  const net = `UI Net ${c.name}`;
  const svcOn = () => sheet.locator('[aria-label="Streaming services"] .chip.on').allInnerTexts();
  const fromTvmaze = () => sheet.getByText("From TVmaze. Pick another to change it.").count();
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Queue" }).click();
  await sheet.locator(".chip.type", { hasText: "TV" }).click();
  await sheet.locator('input[placeholder^="Search"]').fill(net);
  await sheet.locator("label.field", { has: page.locator("span", { hasText: /^Network$/ }) }).locator("input").fill("Apple TV");
  await sheet.locator(".chip", { hasText: "Up Next" }).click();
  ok("adding: a show on Apple TV lights Apple as the default", (await svcOn()).join() === "Apple" && (await fromTvmaze()) === 1, JSON.stringify(await svcOn()));
  await sheet.locator("button", { hasText: "Add to Up Next" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await main.locator(".poster", { hasText: net }).waitFor();
  ok("its tile says Apple", (await main.locator(".poster", { hasText: net }).innerText()).includes("Apple"));
  const netId = (await (await page.request.get(BASE + "/api/state")).json()).items.find((i) => i.title === net)?.id;
  const netWatch = async () => (await (await page.request.get(BASE + "/api/state")).json()).items.find((i) => i.id === netId)?.watchOn;
  ok("the default is not stored", JSON.stringify(await netWatch()) === "[]");
  await main.locator('[aria-label="Filter by streaming service"] .chip', { hasText: "Apple" }).click();
  await page.waitForTimeout(200);
  ok("the Apple filter finds it", (await main.innerText()).includes(net));
  await main.locator('[aria-label="Filter by streaming service"] .chip', { hasText: "Any service" }).click();
  await main.locator(".poster", { hasText: net }).click();
  await sheet.waitFor();
  ok("its sheet shows Apple lit, from TVmaze", (await svcOn()).join() === "Apple" && (await fromTvmaze()) === 1);
  await sheet.locator('[aria-label="Streaming services"] .chip', { hasText: "Netflix" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.sheet [aria-label="Streaming services"] .chip.on')].map((c) => c.textContent).join() === "Netflix");
  ok("picking Netflix replaces the default and is stored", JSON.stringify(await netWatch()) === '["netflix"]' && (await fromTvmaze()) === 0);
  await sheet.locator('[aria-label="Streaming services"] .chip', { hasText: "Netflix" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.sheet [aria-label="Streaming services"] .chip.on')].map((c) => c.textContent).join() === "Apple");
  ok("clearing your pick falls back to the default", JSON.stringify(await netWatch()) === "[]" && (await fromTvmaze()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  //   No Access: kept on the radar and off the home screen; never combined with a service
  const away = `UI Away ${c.name}`;
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Queue" }).click();
  await sheet.locator(".chip.type", { hasText: "TV" }).click();
  await sheet.locator('input[placeholder^="Search"]').fill(away);
  await sheet.locator(".chip", { hasText: "Up Next" }).click();
  const svcChips = sheet.locator('[aria-label="Streaming services"] .chip');
  await svcChips.filter({ hasText: "Hulu" }).click();
  await svcChips.filter({ hasText: "No Access" }).click();
  ok("No Access clears the service picked before it", (await sheet.locator('[aria-label="Streaming services"] .chip.on').allInnerTexts()).join() === "No Access");
  await sheet.locator("button", { hasText: "Add to Up Next" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  //   in Up next it leaves Up Next for its own No Access section at the very bottom, which can be hidden
  const noAccess = main.locator(".fold", { has: page.locator("h2", { hasText: "No Access" }) });
  await noAccess.locator(".poster", { hasText: away }).waitFor();
  ok("a No Access show sits in the No Access section, not Up Next", !(await section("Up Next").innerText()).includes(away));
  ok("No Access is the last section", (await main.locator("section").last().innerText()).startsWith("No Access"));
  await noAccess.locator(".foldhead button", { hasText: "Fold" }).click();
  ok("Fold folds No Access away (Hide on Up next only means a season)", !(await noAccess.locator(".poster").count()));
  await page.reload();
  await main.locator(".fold").waitFor();
  ok("the fold stays hidden after a reload", !(await noAccess.locator(".poster").count()));
  await noAccess.locator(".foldhead button", { hasText: "Show" }).click();
  ok("Show brings it back", (await noAccess.locator(".poster", { hasText: away }).count()) === 1);
  await goView("Now");
  const nowNew = await main.locator(".now-new").innerText();
  ok("Now offers the show on a service, not the one off them", nowNew.includes(show) && !nowNew.includes(away) && /\d+ more (is|are) waiting/.test(nowNew), JSON.stringify(nowNew.slice(0, 300)));
  if (phone) {
    //   on the phone Up Next is three across, the same as Watching, so nothing queued is drawn bigger than what's on
    const cols = (sel) => main.locator(sel).evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").map(parseFloat));
    const upNext = await cols(".now-new .posters");
    const watchingCols = await main.locator(".now-watching .posters").count() ? await cols(".now-watching .posters") : null;
    ok(
      `the phone's Up Next on Now is three across, matching Watching (${upNext.map(Math.round).join(" ")})`,
      upNext.length === 3 && (!watchingCols || (watchingCols.length === 3 && Math.abs(watchingCols[0] - upNext[0]) < 1)),
    );
    await shot("6f-now-up-next-three");
  }
  const stAway = await (await page.request.get(BASE + "/api/state")).json();
  const awayId = stAway.items.find((i) => i.title === away)?.id;
  ok("the API refuses No Access plus a service", (await page.request.patch(`${BASE}/api/items/${awayId}`, { data: { watchOn: ["none", "hulu"] } })).status() === 400);
  await goView("Up next");
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Queue" }).click();
  await sheet.locator(".chip.type", { hasText: "Book" }).click();
  ok("no Where to watch for a book", !(await sheet.locator(".field", { hasText: "Where to watch" }).count()));
  //   a match in your log says what picking it does, as the action: Queue it, in an ink pill
  await sheet.locator('input[placeholder^="Search"]').fill(book);
  const act = sheet.locator(".res", { hasText: book }).first().locator(".act");
  ok("In your log, a match reads Queue it on the Queue tab", (await act.innerText()) === "Queue it");
  const pill = await act.evaluate((el) => {
    const [s, b] = [getComputedStyle(el), getComputedStyle(document.querySelector(".btn"))];
    return s.backgroundColor === b.backgroundColor && s.color === b.color;
  });
  ok("drawn as an ink pill, the buttons' own colors", pill);
  await shot("6e-in-your-log-action");
  // Emptied, the form has nothing to lose; give it a beat to notice before Escape (as escapeAndAnswer does).
  await sheet.locator('input[placeholder^="Search"]').fill("");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
}
