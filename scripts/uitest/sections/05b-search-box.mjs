import { ok } from "../harness.mjs";

// 5b. search from the nav by title, person and note
export default async function searchBox(t) {
  const { c, phone, page, film, shot, main, st } = t;
  const search = page.locator(phone ? ".phone-top .search input" : ".nav .search input");
  const pod = st.items.find((i) => i.type === "podcast" && i.creator);
  for (const [kind, q, expect] of [
    ["title", film, film],
    ["person", pod.creator, pod.title],
    ["finish note", "Noted in the UI test", film],
    ["capture", `Attached line ${c.name}`, film],
  ]) {
    await search.fill(q);
    await main.locator("h1", { hasText: "Search" }).waitFor();
    ok(`search by ${kind} finds ${expect}`, (await main.innerText()).includes(expect));
  }
  await shot("4b-search");
  await search.press("Escape");
  ok("Escape clears the search", (await search.inputValue()) === "" && (await main.locator("h1", { hasText: "Library" }).count()) === 1);
}
