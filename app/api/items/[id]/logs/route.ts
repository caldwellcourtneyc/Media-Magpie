import { body, route, type IdCtx } from "@/lib/api";
import { addLog } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** POST /api/items/:id/logs  { finishedOn?: "YYYY-MM-DD" | null, detail?, note?, keepInQueue? } — every call is a new finish. */
export const POST = route<IdCtx>(async (req, { params }) => ({ log: await addLog((await params).id, await body(req)) }));
