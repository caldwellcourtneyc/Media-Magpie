// What the server does on its own once a page, or the library's state, has been sent, so nothing
// you see waits on a lookup site: stale air dates refresh (lib/airdates.ts), and cover lookups that
// got no answer earlier are tried again (lib/covers.ts). Starting them often is fine: each runs one
// at a time, and neither throws.

import { after } from "next/server";
import { refreshAirDates } from "./airdates";
import { retryCovers } from "./covers";

/** Call while answering a request; the work starts after the response is sent. */
export function refreshInBackground() {
  after(() => refreshAirDates().catch((e) => console.warn("[airdates]", e)));
  after(() => retryCovers());
}
