import { NOT_ON_MINE, SERVICES, THEATER, type Service } from "./config";
import type { Item } from "./types";

const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The service a TV network is, when it is one of yours: "Apple TV" is Apple, "HBO Max" is HBO.
 * Literal on purpose: a channel that streams somewhere else, like FX on
 * Hulu, doesn't count, so the default never claims more than TVmaze said.
 */
export function networkService(network: string | null | undefined): Service | null {
  if (!network) return null;
  const net = flat(network);
  const hit = SERVICES.find(([k, name]) => k !== NOT_ON_MINE && k !== THEATER && net.includes(flat(name)));
  return hit ? hit[0] : null;
}

/**
 * Where it streams: what you set, else (TV only) the TVmaze network when it is one of you
 * services. The default is shown, never stored, so `watchOn` stays only what you chose.
 */
export function whereToWatch(i: Pick<Item, "type" | "watchOn" | "creator">): { keys: string[]; auto: boolean } {
  if (i.watchOn.length) return { keys: i.watchOn, auto: false };
  const svc = i.type === "tv" ? networkService(i.creator) : null;
  return svc ? { keys: [svc], auto: true } : { keys: [], auto: false };
}
