import { BASE, TODAY, ok } from "../harness.mjs";

// 1. log a finished item with a note
export default async function logAFinish(t) {
  const { page, film, shot, sheet, toast, openAdd, tab, openFromLibrary } = t;
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Finished" }).click();
  await sheet.locator(".chip.type", { hasText: "Movie" }).click();
  ok("the title box reads Search movie titles, or type your own", (await sheet.locator('input[placeholder^="Search"]').getAttribute("placeholder")) === "Search movie titles, or type your own");
  await sheet.locator('input[placeholder^="Search"]').fill(film);
  await sheet.locator("textarea").fill("Noted in the UI test.");
  ok("the finish date reads Today, out of the way", (await sheet.locator(".dateline").innerText()).includes("Today"));
  await shot("1-add-filled");
  await sheet.locator("button", { hasText: "Log it as watched" }).click();
  await toast.waitFor();
  ok("toast confirms the log", (await toast.innerText()).includes(film));
  const st1 = await (await page.request.get(BASE + "/api/state")).json();
  ok("a log left alone is dated today", st1.logs.some((l) => l.note === "Noted in the UI test." && l.finishedOn === TODAY));
  await openFromLibrary(film);
  ok("the item sheet's tabs are About, Captures, History", (await sheet.locator(".itabs button").allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim()).join() === "About,Captures,History");
  ok("the sheet opens on About", (await sheet.locator(".itabs button.on").innerText()).startsWith("About"));
  //   About leads with the latest finish: its date and note as History words them, no Edit or Delete, and the button to log again
  const about = sheet.locator(".ipanel").first();
  const lastTime = about.locator(".field", { hasText: "Last time" });
  const lastText = await lastTime.innerText();
  ok("About leads with Last time: the finish's date and note", (await about.locator(":scope > *").first().innerText()).startsWith("Last time") && lastText.includes("Noted in the UI test.") && /[A-Z][a-z]{2} \d{1,2}/.test(lastText));
  ok("Last time has the log-again button and no Edit or Delete", (await lastTime.locator("button").allInnerTexts()).join() === "Log a rewatch");
  ok("Tier comes right under it", (await about.locator(":scope > *").nth(1).innerText()).startsWith("Tier"));
  ok("with one finish and no capture, no link to History and no Shiny things block", !(await about.getByText(/in History|Shiny things/).count()));
  await shot("2a-about-last-time");
  await tab("History");
  ok("the finished item's history shows its note", (await sheet.locator(".loglist").innerText()).includes("Noted in the UI test."));
  await shot("2-item-after-log");

  // Later parts use these.
  Object.assign(t, { about, lastTime });
}
