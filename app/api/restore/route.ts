import { z } from "zod";
import { body, route } from "@/lib/api";
import { restore } from "@/lib/repo";

export const dynamic = "force-dynamic";

const Input = z.object({ kind: z.enum(["item", "log", "capture"]), id: z.string().min(1).max(100) });

/** POST /api/restore { kind: "item" | "log" | "capture", id } — undo a delete. */
export const POST = route(async (req) => {
  const { kind, id } = Input.parse(await body(req));
  return restore(kind, id);
});
