import { body, route, type IdCtx } from "@/lib/api";
import { attachByTitle, deleteCapture, getCapture, updateCapture } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const GET = route<IdCtx>(async (_req, { params }) => ({ capture: await getCapture((await params).id) }));
/** Takes the same fields as POST /api/captures, including { item: { type, title } } to attach by title. */
export const PATCH = route<IdCtx>(async (req, { params }) => ({
  capture: await updateCapture((await params).id, await attachByTitle((await body(req)) as Record<string, unknown>)),
}));
export const DELETE = route<IdCtx>(async (_req, { params }) => deleteCapture((await params).id));
