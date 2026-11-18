// One browser session at one size and color scheme, with the helpers every part uses.
import path from "node:path";
import { SHOTS } from "./harness.mjs";

/** Opens a signed-out page for combo `c`. Parts add to the returned object what later parts need. */
export async function openSession(browser, c) {
  const phone = c.w < 860;
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, colorScheme: c.scheme, hasTouch: phone });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const film = `UI Film ${c.name}`;
  const book = `UI Book ${c.name}`;
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${c.name}-${n}.png`) });
  const main = page.locator("main.main");
  const sheet = page.locator(".sheet").last();
  const toast = page.locator(".toast").last();
  // On desk the rail is the + sheet laid open (the nav button only shows below 1180px); "n" opens the sheet.
  const openAdd = async () => {
    if (phone) await page.locator(".tabbar .plus").click();
    else {
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await page.keyboard.press("n");
    }
    await sheet.waitFor();
  };
  // The item sheet's tabs: About (status, tier, queue), Captures, History.
  const tab = async (name) => {
    await sheet.locator(".itabs button", { hasText: name }).click();
    await sheet.locator(".itabs button.on", { hasText: name }).waitFor();
  };
  const goView = async (label) => {
    if (phone) await page.locator(".tabbar button", { hasText: label }).click();
    else await page.locator(".nav .it", { hasText: label }).first().click();
  };
  const filter = async (label) => {
    if (phone) await page.locator(".chips-bar .chip", { hasText: label }).click();
    else await page.locator(".nav .it", { hasText: label }).first().click();
  };
  // The Library opens as rooms (one cover shelf per type); a type opens as its own room, by tier.
  const openFromLibrary = async (title) => {
    await goView("Library");
    await main.locator(".tile", { hasText: title }).first().click();
    await sheet.waitFor();
  };
  return { c, phone, ctx, page, errs, film, book, shot, main, sheet, toast, openAdd, tab, goView, filter, openFromLibrary };
}
