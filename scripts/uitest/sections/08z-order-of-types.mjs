import { BASE, ok } from "../harness.mjs";

// 8z. Order of types (Settings, Library group): Books moved to the top leads everywhere types are listed,
//   on every device and after a reload; then the default order goes back for the later checks.
export default async function orderOfTypes(t) {
  const { phone, page, shot, main, sheet, openAdd, goView, goSettings } = t;
  {
    const navTypes = () => page.locator(".nav > .it").evaluateAll((els) => els.slice(0, 6).map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()));
    const barTypes = () => page.locator(".chips-bar .chip").allInnerTexts().then((ts) => ts.map((t) => t.trim()));
    const shownTypes = () => (phone ? barTypes() : navTypes());
    const DEFAULT = ["Everything", "TV", "Movies", "Music", "Podcasts", "Books"];
    const BOOKS_FIRST = ["Everything", "Books", "TV", "Movies", "Music", "Podcasts"];
    const savedOrder = async () => (await (await page.request.get(BASE + "/api/settings")).json()).typeOrder.join(",");
    await goSettings();
    const orderSec = main.locator(".setsec", { has: page.locator("h3", { hasText: "Order of types" }) });
    const rows = orderSec.locator(".typeorder li");
    const booksBtn = (label) => orderSec.locator(".typeorder li", { hasText: "Books" }).locator("button", { hasText: label });
    ok("Order of types sits in the Library group, after Your data and before Covers", (await main.locator(".setgroup").first().locator(".setsec h3").allInnerTexts()).slice(0, 3).join(",") === "Your data,Order of types,Covers");
    ok("it lists the five types, each with a swatch, in the default order", (await rows.locator("b").allInnerTexts()).join(",") === "TV,Movies,Music,Podcasts,Books" && (await rows.locator(".sw").count()) === 5);
    ok(
      "the first row can't move up and the last can't move down",
      (await rows.first().locator("button", { hasText: "Move up" }).isDisabled()) &&
        !(await rows.first().locator("button", { hasText: "Move down" }).isDisabled()) &&
        (await rows.last().locator("button", { hasText: "Move down" }).isDisabled()) &&
        !(await rows.last().locator("button", { hasText: "Move up" }).isDisabled()),
    );
    for (let n = 0; n < 4; n++) await booksBtn("Move up").click();
    ok("Move up four times puts Books on top, at once", (await rows.locator("b").allInnerTexts()).join(",") === "Books,TV,Movies,Music,Podcasts");
    ok("Books' Move up is now off", await rows.first().locator("button", { hasText: "Move up" }).isDisabled());
    for (let n = 0; n < 50 && (await savedOrder()) !== "book,tv,movie,music,podcast"; n++) await page.waitForTimeout(100);
    ok("the order is saved on the server", (await savedOrder()) === "book,tv,movie,music,podcast");
    if (!phone) ok("the desk nav follows, Everything still first", (await navTypes()).join(",") === BOOKS_FIRST.join(","), (await navTypes()).join(","));
    await shot("8z-type-order-settings");
    await goView("Library");
    await main.locator("h1", { hasText: "Library" }).waitFor();
    if (phone) ok("the phone's chip bar follows, Everything still first", (await barTypes()).join(",") === BOOKS_FIRST.join(","), (await barTypes()).join(","));
    const rooms = await main.locator(".roomhead h2").allInnerTexts();
    ok(`the Library's rooms follow (${rooms.join(", ")})`, rooms[0] === "Books" && rooms.join(",") === BOOKS_FIRST.slice(1).filter((t) => rooms.includes(t)).join(","));
    const form = phone ? sheet : page.locator(".addrail");
    if (phone) await openAdd();
    await form.locator(".addtabs button", { hasText: "Queue" }).click();
    const addOrder = (await form.locator('[role="radiogroup"][aria-label="Type"] .chip').allInnerTexts()).map((t) => t.trim()).join(",");
    ok(`the Add form's type chips follow (${addOrder})`, addOrder === "Book,TV,Movie,Album,Podcast");
    if (phone) {
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".sheet"));
    }
    await page.reload();
    await main.waitFor();
    ok("the new order survives a reload", (await shownTypes()).join(",") === BOOKS_FIRST.join(","), (await shownTypes()).join(","));
    await shot("8z-type-order-library");
    // Back to the default for the later checks: Books down four times.
    await goSettings();
    for (let n = 0; n < 4; n++) await booksBtn("Move down").click();
    for (let n = 0; n < 50 && (await savedOrder()) !== "tv,movie,music,podcast,book"; n++) await page.waitForTimeout(100);
    ok("moving Books back down restores the default order", (await savedOrder()) === "tv,movie,music,podcast,book");
    await page.reload();
    await main.waitFor();
    await goView("Library");
    await main.locator("h1", { hasText: "Library" }).waitFor();
    ok("and the nav or chip bar is back to the default", (await shownTypes()).join(",") === DEFAULT.join(","), (await shownTypes()).join(","));
    await goView("Now");
  }
}
