import { ok } from "../harness.mjs";

// 9. light/dark switch persists across reload
export default async function lightAndDark(t) {
  const { c, phone, page, main } = t;
  const before = await page.evaluate(() => document.documentElement.dataset.theme || "system");
  await page.locator(phone ? ".phone-top .iconbtn" : ".nav .iconbtn").first().click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.reload();
  await main.waitFor();
  const afterReload = await page.evaluate(() => document.documentElement.dataset.theme);
  ok(`theme switch flips and persists (${before} -> ${after})`, after === (c.scheme === "dark" ? "light" : "dark") && afterReload === after);
}
