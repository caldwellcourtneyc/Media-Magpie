import { BASE, TODAY, ok } from "../harness.mjs";

// 7c. capture upgrades: Note first, time, marks, images, talk about it
//   a new capture opens on Note, the kinds read Note, Idea, Link, Quote, and nothing is prefilled
export default async function marksImagesAndTalks(t) {
  const { c, phone, page, shot, main, sheet, openAdd, tab, goView, podName } = t;
  await openAdd();
  // From Shiny things the + opens straight on the capture tab, with the cursor in the words
  if (phone) ok("on the phone a new capture puts the cursor in the words", (await sheet.locator(".seg button.on").innerText()) === "Shiny things" && (await sheet.locator("textarea").first().evaluate((el) => el === document.activeElement)));
  await sheet.locator(".seg button", { hasText: "Shiny things" }).click();
  ok("a new capture opens on Note", (await sheet.locator('[aria-label="Kind"] .chip.on').innerText()) === "Note");
  ok("the kinds read Note, Idea, Link, Quote", (await sheet.locator('[aria-label="Kind"] .chip').allInnerTexts()).join(",") === "Note,Idea,Link,Quote");
  const findBox = sheet.locator('input[placeholder="Find something in your log"]');
  ok("nothing is prefilled: From is an empty search", !(await sheet.locator(".picked").count()) && (await findBox.inputValue()) === "");
  //   the phone's quick order: kind, image, the words, From, Talk about it, More, Save; desk keeps the words first
  const order = await sheet.evaluate((el) => {
    const at = (sel, text) => [...el.querySelectorAll(sel)].find((x) => !text || x.textContent.trim().startsWith(text));
    const parts = { kind: at('[aria-label="Kind"]'), image: at("label.filepick"), words: at("textarea"), from: at('input[placeholder="Find something in your log"]'), talk: at("button.chip", "Talk about it"), more: at("button.linkbtn", "More:"), save: at(".capsave .btn") };
    return Object.entries(parts)
      .filter(([, x]) => x)
      .sort(([, a], [, b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map(([k]) => k)
      .join(",");
  });
  const fromFirst = await sheet.evaluate((el) => {
    const f = el.querySelector('input[placeholder="Find something in your log"]');
    const t = el.querySelector("textarea");
    return !!(f.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  const linkShown = await sheet.locator('input[placeholder="https://"]').count();
  // A Note is its own words, so the second note box stays out (More doesn't offer it either).
  if (phone) ok(`on the phone the order is kind, image, the words, From, Talk about it, More, Save (${order})`, order === "kind,image,words,from,talk,more,save" && !linkShown && (await sheet.locator("button", { hasText: "More: link, date" }).count()) === 1);
  else ok(`on desk the words come first, every field open (${order})`, !fromFirst && linkShown === 1 && order === "kind,words,image,from,talk,save");
  ok("a Note has no second note box", !(await sheet.locator("label.field", { hasText: "Your note" }).count()));
  //   the image button sits right after the kinds on the phone, so a screenshot-only mark needs no scrolling
  const imageFirst = await sheet.evaluate((el) => {
    const f = el.querySelector('input[placeholder="Find something in your log"]');
    const p = el.querySelector("label.filepick");
    return !!(p.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  if (phone) ok("on the phone Upload Image? comes before From", imageFirst);
  //   a mark: podcast, episode and time, no words. 1309 reads 13:09.
  await findBox.fill(podName);
  await sheet.locator(".res", { hasText: podName }).click();
  await sheet.locator("label.field", { hasText: "Episode (optional)" }).locator("input").fill("Ep. 9");
  const timeBox = sheet.locator("label.field", { hasText: "Time (optional)" }).locator("input");
  await timeBox.fill("1309");
  await timeBox.blur();
  ok("typing 1309 in Time gives 13:09", (await timeBox.inputValue()) === "13:09");
  await shot("6a-quick-capture");
  const saveMark = sheet.locator("button.btn.wide");
  ok("with no words, Save reads Save to finish later", (await saveMark.innerText()) === "Save to finish later");
  await saveMark.click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  ok("saving a mark says it's marked To finish", (await page.locator(".toast").last().innerText()).includes("To finish"));
  //   a screenshot alone makes a mark; it's shrunk on the device before upload
  const screenshot = await page.screenshot({ fullPage: true });
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Shiny things" }).click();
  ok("the image button reads Upload Image?, with no label above it", (await sheet.locator("label.filepick").innerText()) === "Upload Image?" && !(await sheet.innerText()).includes("Image (optional)"));
  await sheet.locator('input[type="file"]').setInputFiles({ name: "screenshot.png", mimeType: "image/png", buffer: screenshot });
  await sheet.locator(".capimg img").waitFor();
  const thumbBox = await sheet.locator(".capimg img").boundingBox();
  ok(`the picked image shows as a small thumbnail (${Math.round(thumbBox.width)}x${Math.round(thumbBox.height)})`, thumbBox.width <= 52 && thumbBox.height <= 72);
  await shot("6a2-picked-image");
  await sheet.locator("button.btn.wide", { hasText: "Save to finish later" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  //   pasting: an image on the clipboard becomes the capture's image, as if picked; pasted text is left alone
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Shiny things" }).click();
  await sheet.locator("textarea").fill(`Pasted shot ${c.name}`);
  const paste = (b64) =>
    sheet.locator("textarea").evaluate((el, data) => {
      const dt = new DataTransfer();
      if (data) dt.items.add(new File([Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0))], "pasted.png", { type: "image/png" }));
      else dt.setData("text/plain", "just words");
      // dispatchEvent answers false when the form took the paste for itself.
      return el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, b64);
  ok("pasting plain text into the words is left to the browser", (await paste(null)) === true && !(await sheet.locator(".capimg").count()));
  const pasteTaken = (await paste(screenshot.toString("base64"))) === false;
  await sheet.locator(".capimg img").waitFor();
  const pastedBox = await sheet.locator(".capimg img").boundingBox();
  ok(
    "a pasted image becomes the capture's image: thumbnail, Change image and Remove image, as if picked",
    pasteTaken && pastedBox.width <= 52 && pastedBox.height <= 72 && (await sheet.locator("label.filepick").innerText()) === "Change image" && (await sheet.locator(".capimg .linkbtn", { hasText: "Remove image" }).count()) === 1
  );
  await paste(screenshot.toString("base64"));
  await page.waitForTimeout(400);
  ok("a second paste replaces it: still one image", (await sheet.locator(".capimg img").count()) === 1);
  //   the Paste image button sits beside Upload wherever the browser can read the clipboard, and says so when it finds no image
  const pasteBtn = sheet.locator(".capbtns button", { hasText: "Paste image" });
  if (await page.evaluate(() => typeof navigator.clipboard?.read === "function")) {
    await sheet.locator(".capimg .linkbtn", { hasText: "Remove image" }).click();
    ok("Paste image sits beside Upload Image?", (await sheet.locator(".capbtns").innerText()).replace(/\s+/g, " ").trim() === "Upload Image? Paste image");
    await pasteBtn.click();
    await sheet.locator(".capbtns + .hint", { hasText: "No image on the clipboard" }).waitFor();
    ok("with no image to read, Paste image says No image on the clipboard", true);
    await paste(screenshot.toString("base64"));
    await sheet.locator(".capimg img").waitFor();
  } else ok("no Paste image button where the browser can't read the clipboard", !(await pasteBtn.count()));
  await shot("6a3-pasted-image");
  await sheet.locator(".capsave .btn", { hasText: "Save capture" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  const st7 = await (await page.request.get(BASE + "/api/state")).json();
  const pastedCap = st7.captures.find((x) => x.body === `Pasted shot ${c.name}`);
  const pastedRes = pastedCap?.image ? await page.request.get(BASE + `/api/images/${pastedCap.image.id}`) : null;
  ok(
    "the pasted image is saved with the capture, shrunk to a JPEG like a picked one",
    pastedCap?.image?.type === "image/jpeg" && pastedRes?.headers()["content-type"] === "image/jpeg" && (await pastedRes.body()).length === pastedCap.image.bytes && pastedCap.image.bytes < 500 * 1024
  );
  const podItem = st7.items.find((i) => i.title === podName);
  const podMark = st7.captures.find((x) => x.itemId === podItem?.id && x.body === "" && x.detail === "Ep. 9");
  ok("the mark keeps podcast, episode and time, with no words", podMark?.time === "13:09");
  // The newest screenshot mark (one is left behind by each earlier run in this database).
  const shotMark = st7.captures.filter((x) => x.body === "" && x.image).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).at(0);
  const imgRes = shotMark ? await page.request.get(BASE + `/api/images/${shotMark.image.id}`) : null;
  const imgBody = imgRes ? await imgRes.body() : Buffer.alloc(0);
  ok(
    `the screenshot (${Math.round(screenshot.length / 1024)} KB) went up shrunk as a JPEG (${Math.round(imgBody.length / 1024)} KB)`,
    shotMark?.image.type === "image/jpeg" && imgRes.headers()["content-type"] === "image/jpeg" && imgBody.length === shotMark.image.bytes && imgBody.length < 500 * 1024
  );
  //   Shiny things shows marks among the captures, tagged To finish; the To finish chip lists only marks
  await goView("Shiny things");
  const podMarkTile = main.locator(".capgrid .cap.mark", { hasText: podName });
  await podMarkTile.waitFor();
  // Earlier runs finish their screenshot marks (the Written by Claude step below), so one is left: this run's.
  ok(
    "marks show in the main list, tagged To finish, the screenshot with its picture",
    (await podMarkTile.count()) === 1 && (await podMarkTile.locator(".kind").innerText()).toLowerCase().includes("to finish") && (await main.locator(".cap.mark img").count()) === 1
  );
  const thumbOk = await main.locator(".cap.mark img").first().evaluate((im) => im.complete && im.naturalWidth > 0);
  ok("the screenshot's thumbnail loads", thumbOk);
  await main.locator(".chip", { hasText: "To finish" }).click();
  ok("the To finish chip lists only marks", (await main.locator(".capgrid .cap").count()) === (await main.locator(".capgrid .cap.mark").count()) && (await podMarkTile.count()) === 1);
  await shot("6b-to-finish");
  //   finishing a mark: its time shows when it's opened; words and Talk about it, then it's no longer To finish
  await podMarkTile.click();
  await sheet.waitFor();
  ok("a mark opens as Finish this, its time showing", (await sheet.locator(".sheet-head h2").innerText()) === "Finish this" && (await sheet.locator("label.field", { hasText: "Time (optional)" }).locator("input").inputValue()) === "13:09");
  await sheet.locator("textarea").fill(`Mark finished ${c.name}`);
  await sheet.locator("button.chip", { hasText: "Talk about it" }).click();
  await sheet.locator("button", { hasText: "Save changes" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await page.waitForTimeout(200);
  ok("a written-up mark leaves To finish", !(await main.locator(".cap", { hasText: `Mark finished ${c.name}` }).count()));
  await main.locator(".chip", { hasText: "All kinds" }).click();
  const tile = main.locator(".cap", { hasText: `Mark finished ${c.name}` });
  ok("it shows among the captures, without its time on the tile", (await tile.count()) === 1 && !(await tile.innerText()).includes("13:09"));
  //   To talk about lists it; after a talk (Claude writes through the API) it keeps the date and one line, apart from your note
  await main.locator(".chip", { hasText: "To talk about" }).click();
  ok("To talk about lists it", (await main.locator(".capgrid .cap").count()) === 1 && (await main.locator(".capgrid").innerText()).includes(`Mark finished ${c.name}`));
  const talkedCap = (await (await page.request.get(BASE + "/api/captures?talk=waiting")).json()).captures.find((x) => x.body === `Mark finished ${c.name}`);
  ok("the API lists it as waiting for a talk", !!talkedCap && talkedCap.item?.title === podName);
  await page.request.patch(BASE + `/api/captures/${talkedCap.id}`, { data: { talkedOn: TODAY, talkNote: `Landed on a plan ${c.name}` } });
  await page.reload();
  await main.waitFor();
  await goView("Shiny things");
  await main.locator(".chip", { hasText: "To talk about" }).click();
  ok("after the talk it leaves To talk about", (await main.innerText()).includes("Nothing waiting for a talk"));
  await main.locator(".chip", { hasText: "All kinds" }).click();
  ok("and leaves the main list", !(await main.locator(".cap", { hasText: `Mark finished ${c.name}` }).count()));
  await main.locator(".chip", { hasText: "Talked about" }).click();
  const talkedTile = main.locator(".cap", { hasText: `Mark finished ${c.name}` });
  ok(
    "Talked about lists it, with the date and where we landed",
    (await talkedTile.count()) === 1 && (await talkedTile.innerText()).toLowerCase().includes("talked about") && (await talkedTile.innerText()).includes(`Where we landed: Landed on a plan ${c.name}`)
  );
  await shot("6c-talked-chip");
  await talkedTile.click();
  await sheet.waitFor();
  await tab("Captures");
  await sheet.locator(".ipanel:not([hidden]) .q", { hasText: `Mark finished ${c.name}` }).click();
  const opened = page.locator(".sheet").last();
  await opened.locator(".talked").waitFor();
  const talkedText = await opened.locator(".talked").innerText();
  ok("opened, it says when it was talked about and Claude's line", talkedText.includes("Talked about") && talkedText.includes(`Landed on a plan ${c.name}`));
  if (phone) await opened.locator("button", { hasText: "More:" }).click().catch(() => {});
  // A Note with no note saved shows no second note box; Claude's line must not be in one either way.
  const noteBox = opened.locator("label.field", { hasText: "Your note" });
  const noteVal = (await noteBox.count()) ? await noteBox.locator("input").inputValue() : "";
  ok("Claude's line is not in your note", !noteVal.includes("Landed on a plan"));
  await shot("6c-talked");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelectorAll(".sheet").length === 1);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  //   Claude finishes a mark (through the API): it's tagged Written by Claude until you rewrite the words
  await page.request.patch(BASE + `/api/captures/${shotMark.id}`, { data: { body: `Claude wrote this ${c.name}`, byClaude: true } });
  await page.reload();
  await main.waitFor();
  await goView("Shiny things");
  const byTile = main.locator(".cap", { hasText: `Claude wrote this ${c.name}` });
  ok("a mark Claude finished shows Written by Claude", (await byTile.locator(".kind").innerText()).toLowerCase().includes("written by claude"));
  await byTile.click();
  await sheet.waitFor();
  ok("opened, the words say Written by Claude", (await sheet.locator("label.field", { hasText: "Written by Claude" }).count()) === 1);
  await sheet.locator("textarea").fill(`Now in my words ${c.name}`);
  await sheet.locator("button", { hasText: "Save changes" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  const mine = (await (await page.request.get(BASE + `/api/captures/${shotMark.id}`)).json()).capture;
  ok("rewriting the words makes them yours (the tag goes)", mine.byClaude === false && mine.body === `Now in my words ${c.name}`);
}
