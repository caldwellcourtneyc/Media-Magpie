import { route } from "@/lib/api";
import { MEDIA_TYPES, type MediaType } from "@/lib/config";
import { BadInput } from "@/lib/repo";
import { lookup } from "@/lib/lookup";

export const dynamic = "force-dynamic";

/** GET /api/lookup?type=book&q=night+circus — title search with covers, done server-side. */
export const GET = route(async (req) => {
  const u = new URL(req.url);
  const type = u.searchParams.get("type") as MediaType;
  const q = (u.searchParams.get("q") || "").trim().slice(0, 200);
  if (!MEDIA_TYPES.includes(type)) throw new BadInput("type must be one of " + MEDIA_TYPES.join(", "));
  if (q.length < 2) return { results: [], provider: null };
  return lookup(type, q);
});
