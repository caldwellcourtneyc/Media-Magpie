import { body, route } from "@/lib/api";
import { importAll } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * POST /api/import with an export file as the body. Merges by id: rows in the
 * file are added, or overwritten unless the row here changed more recently
 * (those are counted in `kept`). Nothing else is touched, nothing is deleted.
 */
export const POST = route(async (req) => importAll(await body(req)));
