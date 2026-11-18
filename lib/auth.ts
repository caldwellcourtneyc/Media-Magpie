// Single-password auth. The session cookie value is an HMAC derived from
// APP_PASSWORD, so changing the password signs everyone out.
// Web Crypto only, so it runs in the proxy and in route handlers alike.
//
// Optional API_TOKEN: lets a script or voice assistant call /api/* with
// `Authorization: Bearer <token>` instead of a browser session.

const COOKIE_SALT = "media-log-cookie-v1";
export const SESSION_COOKIE = "ml_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180 days: stay signed in on your phone

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

export function authConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

/** The one valid session-cookie value for the current APP_PASSWORD. */
export async function expectedSessionToken(): Promise<string> {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error("APP_PASSWORD is not set");
  const keyMaterial = await sha256(password + COOKIE_SALT);
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("media-log-session"));
  return hex(sig);
}

/** Constant-time comparison (hashed first to equalize length). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function verifyPassword(input: string): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return false;
  return safeEqual(input, password);
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !authConfigured()) return false;
  return safeEqual(token, await expectedSessionToken());
}

export async function verifyBearer(header: string | null): Promise<boolean> {
  const token = process.env.API_TOKEN;
  if (!token || token.length < 16 || !header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  return safeEqual(m[1].trim(), token);
}
