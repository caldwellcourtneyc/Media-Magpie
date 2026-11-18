import { route } from "@/lib/api";
import { refreshInBackground } from "@/lib/background";
import { getState } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Everything the app shows, in one call. After the response is sent, stale air dates refresh and cover
 * lookups that got no answer earlier are tried again.
 */
export const GET = route(async () => {
  refreshInBackground();
  return getState();
});
