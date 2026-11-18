import { NextResponse } from "next/server";
import { authConfigured, expectedSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, verifyPassword } from "@/lib/auth";

// Slow down guessing: each failed attempt from an address adds a delay.
const failures = new Map<string, { n: number; at: number }>();

function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

function isHttps(req: Request) {
  const proto = req.headers.get("x-forwarded-proto");
  return proto ? proto.split(",")[0].trim() === "https" : new URL(req.url).protocol === "https:";
}

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "This server has no APP_PASSWORD set, so nobody can sign in. See the README." }, { status: 503 });
  }
  let password = "";
  try {
    const b = await req.json();
    password = typeof b?.password === "string" ? b.password : "";
  } catch {
    /* empty body */
  }
  const key = clientKey(req);
  const f = failures.get(key);
  if (f && Date.now() - f.at > 15 * 60_000) failures.delete(key);

  if (!(await verifyPassword(password))) {
    const cur = failures.get(key) ?? { n: 0, at: Date.now() };
    cur.n += 1;
    cur.at = Date.now();
    failures.set(key, cur);
    await new Promise((r) => setTimeout(r, Math.min(400 * cur.n, 5000)));
    return NextResponse.json({ error: "That password did not match." }, { status: 401 });
  }
  failures.delete(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await expectedSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
