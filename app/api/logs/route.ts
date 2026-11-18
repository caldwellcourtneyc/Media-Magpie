import { body, route } from "@/lib/api";
import { fillCoverLater } from "@/lib/covers";
import { addLog, BadInput, createItem, findItem, ItemInput } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * The one-call "I finished this" endpoint, meant for scripts and voice assistants.
 * POST /api/logs
 *   { itemId, finishedOn?, detail?, note? }                       log an existing item
 *   { item: { type, title, creator? }, finishedOn?, detail?, note? }  find by type + title, or create it
 */
export const POST = route(async (req) => {
  const b = (await body(req)) as Record<string, unknown>;
  const { itemId, item: itemIn, ...log } = b;
  let id = typeof itemId === "string" ? itemId : null;
  let created = false;
  if (!id) {
    if (!itemIn || typeof itemIn !== "object") throw new BadInput("Send itemId, or item: { type, title }");
    const parsed = ItemInput.parse(itemIn);
    const found = await findItem(parsed.type, parsed.title);
    if (found) id = found.id;
    else {
      const made = await createItem(itemIn);
      id = made.id;
      created = true;
      fillCoverLater(made);
    }
  }
  return { log: await addLog(id, log), itemId: id, createdItem: created };
});
