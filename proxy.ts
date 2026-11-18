import { NextRequest, NextResponse } from "next/server";
import { authConfigured, SESSION_COOKIE, verifyBearer, verifySessionToken } from "./lib/auth";
import { needsHostedDb, NO_DB_LINE } from "./lib/db";

// Every request passes through here. Fails closed: with no APP_PASSWORD set, or on a serverless host
// with no database, nothing but the login page (which explains the problem) is served.
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  if (!authConfigured()) {
    if (isApi) return NextResponse.json({ error: "Server has no APP_PASSWORD set" }, { status: 503 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // The same for a serverless host with no database: there is nowhere to keep anything yet.
  if (needsHostedDb()) {
    if (isApi) return NextResponse.json({ error: NO_DB_LINE }, { status: 503 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  // Bearer tokens are for the JSON API only, never for pages.
  if (isApi && (await verifyBearer(request.headers.get("authorization")))) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Public: Next internals and the exact icon files (a phone fetches the home-screen icon signed out).
  matcher: ["/((?!_next/|favicon\\.ico|icon\\.svg|favicon-32\\.png|apple-icon\\.png|manifest\\.webmanifest).*)"],
};
