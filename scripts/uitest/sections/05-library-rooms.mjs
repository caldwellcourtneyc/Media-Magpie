import { BASE, ok } from "../harness.mjs";

// 5. The Library opens as rooms, one shelf per type, holding everything; the film is marked Top Shelf.
// A type opens as its own room by tier, where the film sits under Top Shelf. Your lists holds everything too.
export default async function libraryRooms(t) {
  const { page, film, shot, main, goView, filter } = t;
  await goView("Library");
  await main.locator("h1", { hasText: "Library" }).waitFor();
  const st = await (await page.request.get(BASE + "/api/state")).json();
  ok("Library opens By type", (await main.locator(".lib-seg button.on").innerText()).trim() === "By type");
  const roomNames = await main.locator(".roomhead h2").allInnerTexts();
  const typesHeld = ["tv", "movie", "music", "podcast", "book"].filter((t) => st.items.some((i) => i.type === t && !i.disliked));
  ok(`one room per type in the library (${roomNames.join(", ")})`, roomNames.length === typesHeld.length);
  ok(`every item is in a room (${st.items.length})`, (await main.locator(".tile").count()) === st.items.length);
  // Earlier runs left their own Top Shelf films, so check order by marks, not by position.
  const movieMarks = await main.locator(".room", { hasText: "Movies" }).locator(".tile").evaluateAll((ts) => ts.map((t) => (t.querySelector(".tmark") ? 1 : 0)));
  ok(
    "in Movies the film is marked Top Shelf, and marked tiles come first",
    (await main.locator(".room .tile", { hasText: film }).locator(".tmark.top").count()) === 1 && movieMarks.join("") === [...movieMarks].sort((a, b) => b - a).join("")
  );
  //   a mark on a tile with no cover sits above the title block, not over its words
  const overlaps = await main.locator(".room .tile").evaluateAll((ts) =>
    ts.filter((t) => {
      const m = t.querySelector(".tmark");
      const b = t.querySelector(".cv.ph b");
      return m && b && m.getBoundingClientRect().bottom > b.getBoundingClientRect().top;
    }).length,
  );
  ok("a Top Shelf or Fave mark never covers a title with no cover", overlaps === 0, `${overlaps} overlap`);
  await shot("4-library-rooms");
  await filter("Movies");
  await main.locator(".lib-seg button.on", { hasText: "Tier" }).waitFor();
  ok("a type opens as its room, by Tier", (await main.locator("h1").innerText()).includes("Movies"));
  ok("the Movies room lists it under Top Shelf", (await main.locator("section", { has: page.locator(".tierhead.top") }).innerText()).includes(film));
  await filter("Books");
  ok("books also group By author", (await main.locator(".lib-seg button").allInnerTexts()).includes("By author"));
  await filter("Everything");
  await goView("Library");
  await main.locator(".lib-seg button", { hasText: "Your lists" }).click();
  ok(`Your lists lists every item (${st.items.length})`, (await main.locator(".rrow").count()) === st.items.length);

  // Later parts use these.
  Object.assign(t, { st });
}
