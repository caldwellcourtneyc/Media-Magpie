import { BASE, ok } from "../harness.mjs";

// 6a. four tiers or none: untiered lights nothing; Not a Fan moves it to the bottom of the Library, hideable
export default async function tierRowAndNotAFan(t) {
  const { page, book, shot, main, sheet, goView, filter } = t;
  await main.locator(".poster", { hasText: book }).click();
  await sheet.waitFor();
  const tierChips = (await sheet.locator('[aria-label="Tier"] .chip').allInnerTexts()).map((t) => t.replace("★", "").trim());
  ok(`the tier row is Not a Fan, Love, Fave, Top Shelf (${tierChips.join(", ")})`, tierChips.join() === "Not a Fan,Love,Fave,Top Shelf");
  ok("an untiered book lights no tier", (await sheet.locator('[aria-label="Tier"] .chip.on').count()) === 0);
  await sheet.locator('[aria-label="Tier"] .chip', { hasText: "Not a Fan" }).click();
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Tier"] .chip.on')?.textContent === "Not a Fan");
  const stNope = await (await page.request.get(BASE + "/api/state")).json();
  ok("Not a Fan is saved as disliked with no tier", stNope.items.some((i) => i.title === book && i.disliked === true && i.tier === null));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await goView("Library");
  const nopeFold = main.locator(".fold", { has: page.locator("h2", { hasText: "Not a Fan" }) });
  await nopeFold.locator(".tile", { hasText: book }).waitFor();
  ok("the book sits under Not a Fan, not in its room", !(await main.locator(".room .tile", { hasText: book }).count()));
  ok("Not a Fan is the last section of the Library", (await main.locator("section").last().innerText()).startsWith("Not a Fan"));
  await nopeFold.locator(".foldhead button", { hasText: "Fold" }).click();
  ok("Fold folds Not a Fan away", !(await nopeFold.locator(".tile").count()));
  await nopeFold.locator(".foldhead button", { hasText: "Show" }).click();
  await main.locator(".lib-seg button", { hasText: "A to Z" }).click();
  ok("A to Z also keeps it under Not a Fan at the bottom", (await nopeFold.locator(".rrow", { hasText: book }).count()) === 1);
  await shot("5a-not-a-fan");
  await nopeFold.locator(".rrow", { hasText: book }).click();
  await sheet.waitFor();
  await sheet.locator('[aria-label="Tier"] .chip', { hasText: "Love" }).click();
  await page.waitForFunction(() => document.querySelector('.sheet [aria-label="Tier"] .chip.on')?.textContent === "Love");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  ok("picking Love takes it out of Not a Fan", !(await main.locator(".fold").count()));
  //   cleared again, the Books room files it under No tier yet, not Loves
  await filter("Books");
  await main.locator(".tile", { hasText: book }).click();
  await sheet.waitFor();
  await sheet.locator('[aria-label="Tier"] .chip', { hasText: "Love" }).click();
  await page.waitForFunction(() => !document.querySelector('.sheet [aria-label="Tier"] .chip.on'));
  ok("tapping a lit Love clears it", (await sheet.locator('[aria-label="Tier"] .chip.on').count()) === 0);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  const noTier = main.locator("section", { has: page.locator(".tierhead h2", { hasText: "No tier yet" }) });
  await noTier.locator(".tile", { hasText: book }).waitFor();
  ok("an untiered book sits under No tier yet, not Loves", !(await main.locator("section", { has: page.locator(".tierhead h2", { hasText: "Loves" }) }).locator(".tile", { hasText: book }).count()));
}
