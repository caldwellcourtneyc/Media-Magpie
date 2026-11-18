import { BASE, ok } from "../harness.mjs";

// 3. set and change a tier
export default async function tiers(t) {
  const { page, film, shot, sheet, tab, about, lastTime } = t;
  await tab("About");
  const lastText2 = await lastTime.innerText();
  ok("Last time now shows the newer finish, labeled Rewatch", lastText2.includes("Second viewing.") && lastText2.includes("Rewatch") && !lastText2.includes("Noted in the UI test."));
  ok("Log a rewatch shows once on About", (await about.locator("button", { hasText: /^Log / }).count()) === 1);
  await lastTime.locator("button", { hasText: "All 2 in History" }).click();
  await sheet.locator(".itabs button.on", { hasText: "History" }).waitFor();
  ok("All 2 in History opens the History tab", await sheet.locator(".loglist").isVisible());
  await tab("About");
  await sheet.locator(".chip.tier-fave").click();
  await page.waitForFunction(() => document.querySelector(".sheet .chip.tier-fave")?.classList.contains("on"));
  ok("tier set to Fave", true);
  await sheet.locator(".chip.tier-top").click();
  await page.waitForFunction(() => document.querySelector(".sheet .chip.tier-top")?.classList.contains("on"));
  ok("tier changed to Top Shelf", true);
  //   tapping the lit tier clears it: nothing lit, saved as no tier
  await sheet.locator(".chip.tier-top").click();
  await page.waitForFunction(() => !document.querySelector('.sheet [aria-label="Tier"] .chip.on'));
  const stClear = await (await page.request.get(BASE + "/api/state")).json();
  ok("tapping the lit tier clears it, saved as no tier", stClear.items.some((i) => i.title === film && i.tier === null && !i.disliked));
  await sheet.locator(".chip.tier-top").click();
  await page.waitForFunction(() => document.querySelector(".sheet .chip.tier-top")?.classList.contains("on"));
  await shot("3-item-sheet");
}
