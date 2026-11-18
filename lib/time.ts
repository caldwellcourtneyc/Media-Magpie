// Where in an episode, film or track a capture came from. Typed the quick way on a phone,
// digits only, read like a clock from the right: 1309 is 13:09, 309 is 3:09, 11309 is
// 1:13:09. With colons it's kept as typed, tidied. Shared by the form and the server.

/** "13:09" from "1309", "13:09" or "13.09"; "" for blank; null when it can't be a time. */
export function normalizeTime(raw: string): string | null {
  const s = raw.trim().replace(/[.]/g, ":");
  if (!s) return "";
  let h = 0;
  let m: number;
  let sec: number;
  if (/^\d{1,7}$/.test(s)) {
    const d = s.padStart(3, "0");
    sec = Number(d.slice(-2));
    const rest = d.slice(0, -2);
    if (rest.length > 2) {
      m = Number(rest.slice(-2));
      h = Number(rest.slice(0, -2));
    } else m = Number(rest);
  } else {
    const parts = s.split(":");
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
    const n = parts.map(Number);
    if (n.length === 3) [h, m, sec] = n;
    else [m, sec] = n;
  }
  if (sec > 59) return null;
  // Over an hour reads as hours, so 90:00 becomes 1:30:00.
  if (h === 0 && m > 59) {
    h = Math.floor(m / 60);
    m = m % 60;
  } else if (h > 0 && m > 59) return null;
  if (h > 99) return null;
  const pad = (x: number) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
