import { ok } from "../harness.mjs";

// 6. queue: add, then move between all three sections
export default async function queueSections(t) {
  const { page, book, shot, main, sheet, openAdd, goView } = t;
  await openAdd();
  await sheet.locator(".seg button", { hasText: "Queue" }).click();
  await sheet.locator(".chip.type", { hasText: "Book" }).click();
  await sheet.locator('input[placeholder^="Search"]').fill(book);
  await sheet.locator(".chip", { hasText: "Up Next" }).click();
  await sheet.locator("button", { hasText: "Add to Up Next" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await goView("Up next");
  const section = (name) => main.locator("section", { has: page.locator("h2", { hasText: name }) });
  //   Up next reads In Progress (Everything holds books too), Up Next, Saved for Later, with no descriptions under them;
  //   Coming soon joins them under In Progress once something has a date (8b), and isn't drawn until then
  const heads = (await main.locator("h2").allInnerTexts()).map((t) => t.replace(/\s*\d+$/, "").trim());
  ok(`Up next sections in order (${heads.join(", ")})`, heads.slice(0, 3).join() === "In Progress,Up Next,Saved for Later");
  ok("no descriptions under the sections", !(await main.locator(".qsec-sub").count()));
  ok("with nothing dated, Coming soon isn't drawn on Up next at all", !heads.includes("Coming soon") && !(await main.locator(".soon").count()) && !(await main.innerText()).includes("Nothing with a date"));
  await section("Up Next").locator(".poster", { hasText: book }).waitFor();
  ok("queued book is a tile in Up Next", true);
  //   tiles open the item; moving between sections happens there
  const moveBook = async (chip, to) => {
    await main.locator(".poster", { hasText: book }).click();
    await sheet.waitFor();
    await sheet.locator('[aria-label="Queue section"] .chip', { hasText: chip }).click();
    await page.waitForFunction((t) => document.querySelector('.sheet [aria-label="Queue section"] .chip.on')?.textContent === t, chip);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet"));
    await section(to).locator(".poster", { hasText: book }).waitFor();
  };
  await moveBook("In Progress", "In Progress");
  ok("moved to In Progress, shown under In Progress with Everything picked", true);
  //   where you are saves on return, and closing after it doesn't ask
  await main.locator(".poster", { hasText: book }).click();
  await sheet.getByRole("textbox", { name: "Progress" }).fill("p. 50");
  await sheet.getByRole("textbox", { name: "Progress" }).press("Enter");
  ok("return saves where you are", await page.locator(".toast", { hasText: "Progress saved" }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.keyboard.press("Escape");
  ok("closing after it doesn't ask", await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 3000 }).then(() => true, () => false));
  await moveBook("Saved for Later", "Saved for Later");
  ok("moved to Saved for Later", true);
  await shot("5-queue");

  // Later parts use these.
  Object.assign(t, { section });
}
