import { body, route, type IdCtx } from "@/lib/api";
import { deleteLog, updateLog } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const PATCH = route<IdCtx>(async (req, { params }) => ({ log: await updateLog((await params).id, await body(req)) }));
export const DELETE = route<IdCtx>(async (_req, { params }) => deleteLog((await params).id));
