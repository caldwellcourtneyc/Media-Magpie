import { route } from "@/lib/api";
import { exportAll } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * GET /api/export — the whole database as one JSON file, deleted rows included.
 * ?images=none leaves the image bytes out (each image is still listed, with its size); fetch them one
 * at a time from /api/images/:id. That keeps the file small for hosts that cap a response's size.
 */
export const GET = route(async (req) => {
  const imageData = new URL(req.url).searchParams.get("images") !== "none";
  const data = await exportAll(undefined, { imageData });
  const stamp = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="media-log-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
