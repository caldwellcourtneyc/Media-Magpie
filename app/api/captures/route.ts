import { body, route } from "@/lib/api";
import { attachByTitle, createCapture, getState, isMark } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * GET /api/captures              every capture
 * GET /api/captures?talk=waiting  the ones you switched to "Talk about it" and haven't talked about yet
 * GET /api/captures?mark=1        marks: saved with no words yet, shown as "To finish"
 * Each capture carries `item` ({ id, type, title, creator }) when it hangs off something you logged,
 * so a script can read the list without a second call. Images are at GET /api/images/:id.
 */
/** A yes/no filter from the address: absent or empty means don't filter, "0" and "false" mean no, anything else yes. */
const yesNo = (v: string | null): boolean | null => (v == null || v === "" ? null : v !== "0" && v !== "false");

export const GET = route(async (req) => {
  const p = new URL(req.url).searchParams;
  const talk = yesNo(p.get("talk"));
  const mark = yesNo(p.get("mark"));
  const state = await getState();
  const items = new Map(state.items.map((i) => [i.id, i]));
  const list = state.captures.filter((c) => (talk === null || c.talk === talk) && (mark === null || isMark(c) === mark));
  return {
    captures: list.map((c) => {
      const i = c.itemId ? items.get(c.itemId) : null;
      return { ...c, item: i ? { id: i.id, type: i.type, title: i.title, creator: i.creator } : null };
    }),
  };
});

/**
 * POST /api/captures  { body, kind?, itemId?, who?, source?, url?, note?, mediaType?, detail?, time?, talk?, image?, capturedOn?, tags? }
 * Voice-friendly form: { body, item: { type, title } } attaches to that item if it
 * exists; otherwise the capture is kept standalone with the title as its source.
 * No body makes a mark, which needs an image or something saying where it's from.
 */
export const POST = route(async (req) => ({ capture: await createCapture(await attachByTitle((await body(req)) as Record<string, unknown>)) }));
