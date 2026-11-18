import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BadInput, NotFound } from "./repo";

type Handler<C> = (req: Request, ctx: C) => Promise<unknown>;

/**
 * Wraps a route handler: JSON in, JSON out, consistent errors.
 * Writes must be JSON from this site (an Origin from elsewhere is refused),
 * which keeps other sites from posting into it with your cookie.
 */
export function route<C>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
        let originHost: string | null = null;
        try {
          originHost = origin ? new URL(origin).host : null;
        } catch {
          originHost = "invalid";
        }
        if (origin && host && originHost !== host) {
          return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
        }
        const ct = req.headers.get("content-type") || "";
        if (req.method !== "DELETE" && !ct.includes("application/json")) {
          return NextResponse.json({ error: "Send JSON (Content-Type: application/json)" }, { status: 415 });
        }
      }
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ZodError) {
        const i = e.issues[0];
        return NextResponse.json({ error: `${i.path.join(".") || "input"}: ${i.message}`, issues: e.issues }, { status: 400 });
      }
      if (e instanceof BadInput) return NextResponse.json({ error: e.message }, { status: 400 });
      if (e instanceof NotFound) return NextResponse.json({ error: e.message }, { status: 404 });
      if (e instanceof SyntaxError) return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
      console.error("[api]", e);
      return NextResponse.json({ error: "Something went wrong on the server. Try again; if it repeats, export a backup from Settings." }, { status: 500 });
    }
  };
}

export async function body(req: Request): Promise<unknown> {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

export type IdCtx = { params: Promise<{ id: string }> };
