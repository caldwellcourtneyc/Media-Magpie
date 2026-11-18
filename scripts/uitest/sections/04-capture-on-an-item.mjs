import { ok } from "../harness.mjs";

// 4. capture attached to this item
export default async function captureOnAnItem(t) {
  const { c, page, film, shot, main, sheet, tab, goView, about } = t;
  await tab("Captures");
  await sheet.locator("button", { hasText: "+ Capture from this" }).click();
  const capSheet = page.locator(".sheet").last();
  await capSheet.locator("textarea").fill(`Attached line ${c.name}`);
  ok("capture form shows the item it is attached to", (await capSheet.locator(".picked").innerText()).includes(film));
  await capSheet.locator("button", { hasText: "Save capture" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".sheet").length === 1);
  await page.waitForFunction((t) => document.querySelector(".sheet")?.innerText.includes(t), `Attached line ${c.name}`);
  ok("attached capture appears on the item", true);
  ok("the Captures tab counts the new capture", (await sheet.locator(".itabs button", { hasText: "Captures" }).innerText()).endsWith("1"));
  //   About shows it too, under Shiny things, between Last time and Tier
  await tab("About");
  const aboutRows = await about.locator(":scope > *").allInnerTexts();
  ok(
    "About shows the capture under Shiny things, after Last time and before Tier",
    aboutRows[0].startsWith("Last time") && aboutRows[1].startsWith("Shiny things") && aboutRows[1].includes(`Attached line ${c.name}`) && aboutRows[2].startsWith("Tier"),
    aboutRows.map((t) => t.split("\n")[0]).join(" | ")
  );
  ok("one capture: no link to the Captures tab", !(await about.getByText(/in Captures/).count()));
  await shot("4-about-last-time-and-capture");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await goView("Now");
  ok("Now is for watching: no add panel and no captures on it", !(await main.locator(".addpanel, .now-lately, .bigline").count()));
}
