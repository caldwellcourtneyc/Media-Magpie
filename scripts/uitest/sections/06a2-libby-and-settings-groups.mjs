import path from "node:path";
import { BASE, TMP, ok } from "../harness.mjs";

// 6a2. Libby: no libraries, no links; one added in Settings puts a search link on books (and authors) only,
//   as a Find in Libby row on About, one chip per library, out of the header
export default async function libbyAndSettingsGroups(t) {
  const { c, phone, page, film, book, shot, main, sheet, filter, openFromLibrary } = t;
  const goSettings = async () => {
    if (phone) await page.locator('.phone-top [aria-label="Settings"]').click();
    else await page.locator(".nav .foot .it", { hasText: "Settings" }).click();
    await main.locator("h1", { hasText: "Settings" }).waitFor();
  };
  await openFromLibrary(book);
  ok("with no Libby libraries a book shows no Libby links", !(await sheet.locator(".libby").count()));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await goSettings();
  //   Settings: three loud groups; two columns on desk (Library left, the other two stacked right), one on the phone
  const groups = await main.locator(".setgroup").evaluateAll((els) =>
    els.map((g) => ({ name: g.querySelector(":scope > h2").textContent, secs: [...g.querySelectorAll(".setsec h3")].map((h) => h.textContent.replace(/\s*\(\d+\)$/, "").trim()).join(","), x: Math.round(g.getBoundingClientRect().x), y: Math.round(g.getBoundingClientRect().y) }))
  );
  ok(
    "Settings groups: Library, This device, Connections, each with its sections",
    groups.map((g) => `${g.name}: ${g.secs}`).join(" | ") === "Library: Your data,Order of types,Covers,Recently deleted | This device: Light or dark,Sign out | Connections: Libby,For developers",
    JSON.stringify(groups),
  );
  if (phone) ok("on the phone the groups stack in one column, in order", groups.every((g) => g.x === groups[0].x) && groups[0].y < groups[1].y && groups[1].y < groups[2].y);
  else ok("on desk Library is the left column, This device and Connections stacked on the right", groups[1].x > groups[0].x && groups[2].x === groups[1].x && groups[1].y === groups[0].y && groups[2].y > groups[1].y, JSON.stringify(groups));
  const dataSec = main.locator(".setsec", { has: page.locator("h3", { hasText: "Your data" }) });
  const devSec = main.locator("details.devfold");
  ok("the backup line is one plain line, with no file path", (await dataSec.locator(".hint").innerText()) === "Backed up automatically, one file a day." && !(await dataSec.innerText()).includes(TMP));
  ok("For developers starts folded", (await devSec.getAttribute("open")) === null);
  await devSec.locator("summary").click();
  ok("opened, it says where the backups go and how long they're kept", (await devSec.innerText()).includes(path.join(TMP, "db-b")) && (await devSec.innerText()).includes("the last 14 days"));
  await devSec.locator("summary").click();
  ok("Light or dark and Sign out keep their controls", (await main.locator('[aria-label="Theme"] [role="radio"]').count()) === 3 && (await main.locator(".setsec button", { hasText: "Sign out" }).count()) === 1);
  await shot("5a1-settings");
  const libbySec = main.locator(".setsec", { has: page.locator("h3", { hasText: "Libby" }) });
  ok("Libby says where a library's code is found, by the add form", (await libbySec.locator(".libbyadd .hint").innerText()).includes("the word after /library/"));
  await libbySec.getByRole("textbox", { name: "Library name" }).fill("Test Library");
  await libbySec.getByRole("textbox", { name: "Libby code" }).fill("TestLib");
  await libbySec.locator("button", { hasText: "Add library" }).click();
  await libbySec.locator(".trash-row", { hasText: "Test Library" }).waitFor();
  ok("an added library is listed, its code lowercased", (await libbySec.locator(".trash-row small").innerText()) === "testlib");
  ok("the API refuses a code with spaces", (await page.request.put(BASE + "/api/settings", { data: { libby: [{ key: "has space", name: "X" }] } })).status() === 400);
  await shot("5a2-libby-settings");
  await openFromLibrary(book);
  const libbyLink = sheet.locator(".libby a", { hasText: "Test Library" });
  const bookCreator = (await (await page.request.get(BASE + "/api/state")).json()).items.find((i) => i.title === book)?.creator;
  const wantQ = encodeURIComponent(bookCreator ? `${book} ${bookCreator}` : book);
  ok(
    "a book links to a Libby search at that library, in a new tab",
    (await libbyLink.getAttribute("href")) === `https://libbyapp.com/search/testlib/search/query-${wantQ}/page-1` && (await libbyLink.getAttribute("target")) === "_blank",
    await libbyLink.getAttribute("href"),
  );
  const bookAbout = await sheet.locator(".ipanel").first().locator(":scope > *").allInnerTexts();
  ok(
    "the link is a chip in a Find in Libby row on About, above Tier, and not in the header",
    (await libbyLink.getAttribute("class")).includes("chip") &&
      (await sheet.locator(".ipanel").first().locator(".field.libby > span").innerText()) === "Find in Libby" &&
      bookAbout[0].startsWith("Find in Libby") &&
      bookAbout[1].startsWith("Tier") &&
      !(await sheet.locator('.ihero .libby, .ihero a[href*="libbyapp.com"]').count()) &&
      !(await sheet.locator(".ihero").innerText()).includes("Libby"),
    bookAbout.map((t) => t.split("\n")[0]).join(" | "),
  );
  await page.waitForTimeout(500);
  await shot("5a3-libby-link");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  //   an author you follow keeps the links the same way, searching the name, under Status
  const author = `UI Author ${c.name}`;
  const authorId = (await (await page.request.post(BASE + "/api/items", { data: { type: "book", title: author, entity: "creator", status: "following" } })).json()).item.id;
  await page.goto(`${BASE}/?item=${authorId}`);
  await sheet.waitFor();
  const authorAbout = await sheet.locator(".ipanel").first().locator(":scope > *").allInnerTexts();
  ok(
    "an author's sheet has the Find in Libby row too, under Status, searching the name",
    (await sheet.locator(".field.libby a.chip").getAttribute("href")) === `https://libbyapp.com/search/testlib/search/query-${encodeURIComponent(author)}/page-1` &&
      authorAbout[0].startsWith("Status") &&
      authorAbout[1].startsWith("Find in Libby") &&
      !(await sheet.locator(".ihero .libby").count()),
    authorAbout.map((t) => t.split("\n")[0]).join(" | "),
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await filter("Everything");
  await openFromLibrary(film);
  ok("a movie shows no Libby links", !(await sheet.locator(".libby").count()));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  await goSettings();
  await libbySec.locator(".trash-row", { hasText: "Test Library" }).locator("button", { hasText: "Remove" }).click();
  await page.waitForFunction(() => !document.querySelector(".libbylist"));
  ok("Remove takes the library off", (await (await page.request.get(BASE + "/api/settings")).json()).libby.length === 0);

  // Later parts use these.
  Object.assign(t, { goSettings });
}
