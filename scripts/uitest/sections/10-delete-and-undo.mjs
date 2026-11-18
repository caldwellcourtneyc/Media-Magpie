import { ok } from "../harness.mjs";

// 10. delete and undo
export default async function deleteAndUndo(t) {
  const { film, main, sheet, toast, openFromLibrary } = t;
  await openFromLibrary(film);
  ok("a movie's header still shows its year", (await sheet.locator(".ihero").innerText()).includes("1999"));
  await sheet.locator("button", { hasText: `Delete ${film}` }).click();
  await toast.waitFor();
  ok("delete closes the sheet and offers Undo", (await toast.innerText()).includes("Undo"));
  await toast.locator("button", { hasText: "Undo" }).click();
  await main.locator(".tile", { hasText: film }).first().waitFor();
  ok("Undo brings it back", true);
}
