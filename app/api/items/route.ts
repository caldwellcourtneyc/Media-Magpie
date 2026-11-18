import { body, route } from "@/lib/api";
import { fillCoverLater } from "@/lib/covers";
import { addLog, createItem, getState, LogInput } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** GET /api/items?type=book&queue=up_next&tier=fave */
export const GET = route(async (req) => {
  const u = new URL(req.url);
  const type = u.searchParams.get("type");
  const queue = u.searchParams.get("queue");
  const tier = u.searchParams.get("tier");
  const { items } = await getState();
  return {
    items: items.filter(
      (i) => (!type || i.type === type) && (!queue || i.queue === queue) && (!tier || i.tier === tier)
    ),
  };
});

/**
 * POST /api/items  { type, title, creator?, year?, coverUrl?, tier?, queue?, ...,
 *                    log?: { finishedOn?, detail?, note? } }
 * With `log`, the item is created and its first finish is logged in one call.
 */
export const POST = route(async (req) => {
  const b = (await body(req)) as Record<string, unknown>;
  const { log, ...fields } = b;
  if (log !== undefined) LogInput.parse(log);
  const item = await createItem(fields);
  fillCoverLater(item);
  const created = log ? await addLog(item.id, log) : null;
  return { item, log: created };
});
