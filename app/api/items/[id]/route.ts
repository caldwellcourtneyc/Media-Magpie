import { body, route, type IdCtx } from "@/lib/api";
import { deleteItem, getItem, updateItem } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const GET = route<IdCtx>(async (_req, { params }) => getItem((await params).id));

/** PATCH /api/items/:id  { tier?, queue?, title?, ... } — send only what changes; null clears. */
export const PATCH = route<IdCtx>(async (req, { params }) => ({ item: await updateItem((await params).id, await body(req)) }));

/** Soft delete. Restore from Settings or POST /api/restore. */
export const DELETE = route<IdCtx>(async (_req, { params }) => deleteItem((await params).id));
