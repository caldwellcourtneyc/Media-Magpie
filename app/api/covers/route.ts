import { body, route } from "@/lib/api";
import { findCover } from "@/lib/covers";
import { BadInput, getItem } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * POST /api/covers { id } -> { pick, failed }: the best cover for one item, or null (failed: a source didn't answer). Saves nothing; the Missing
 * covers review shows it and saves what you tick through PATCH /api/items/:id. One item per call keeps
 * each request short and the lookup sites unhurried.
 */
export const POST = route(async (req) => {
  const { id } = (await body(req)) as { id?: unknown };
  if (typeof id !== "string") throw new BadInput("Send { id }");
  const { item } = await getItem(id);
  const { pick, failed } = await findCover({ type: item.type, title: item.title, creator: item.creator, year: item.year });
  return { pick, failed };
});
