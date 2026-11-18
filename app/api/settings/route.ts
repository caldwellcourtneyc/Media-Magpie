import { body, route } from "@/lib/api";
import { getLibby, getTypeOrder, setLibby, setTypeOrder } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Settings kept in the database: Libby libraries, [{ key: "nypl", name: "New York" }], and the order of
 * types, ["book", "tv", ...]. PUT changes only the settings it is sent.
 */
const all = async () => ({ libby: await getLibby(), typeOrder: await getTypeOrder() });

export const GET = route(all);

export const PUT = route(async (req: Request) => {
  const raw = await body(req);
  const b = (raw && typeof raw === "object" ? raw : {}) as { libby?: unknown; typeOrder?: unknown };
  // A body without typeOrder is the Libby form's, which has always sent the whole list (none means none).
  if ("libby" in b || !("typeOrder" in b)) await setLibby(b.libby ?? []);
  if ("typeOrder" in b) await setTypeOrder(b.typeOrder);
  return all();
});
