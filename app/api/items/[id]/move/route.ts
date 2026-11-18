import { body, route, type IdCtx } from "@/lib/api";
import { moveItem } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** POST /api/items/:id/move  { top: true } or { above: id } or { below: id }: moves it within its queue section. */
export const POST = route<IdCtx>(async (req, { params }) => ({ item: await moveItem((await params).id, await body(req)) }));
