import demo from "@/seed/demo.json";
import { route } from "@/lib/api";
import { loadDemo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo: loads the small fictional demo library (seed/demo.json) into an empty library,
 * as ordinary items. Refused once the library has anything live in it.
 */
export const POST = route(async () => loadDemo(demo));
