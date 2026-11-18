import { route, type IdCtx } from "@/lib/api";
import { getImage } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * GET /api/images/:id  one capture image's bytes. An image never changes under its id (a new
 * picture gets a new id), so the browser may keep it.
 */
export const GET = route<IdCtx>(async (_req, { params }) => {
  const img = await getImage((await params).id);
  return new Response(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.type,
      "Content-Length": String(img.data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": "inline",
    },
  });
});
