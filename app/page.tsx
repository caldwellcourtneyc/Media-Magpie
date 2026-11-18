import App, { type Filter, type WatchWith } from "@/components/App";
import { MEDIA_TYPES, parseView } from "@/lib/config";
import { refreshInBackground } from "@/lib/background";
import { getState } from "@/lib/repo";
import { testCopy, watchWithLabel } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const t = one("type");
  const state = await getState();
  // Once the page is sent: air dates and missed covers catch up, as they do after a state read.
  // Without this, opening the app and only looking never refreshed anything.
  refreshInBackground();
  return (
    <App
      initial={state}
      initialView={parseView(one("view"))}
      initialFilter={(MEDIA_TYPES as readonly string[]).includes(t ?? "") ? (t as Filter) : "all"}
      initialItem={one("item") ?? null}
      initialWatch={one("with") === "with" || one("with") === "solo" ? (one("with") as WatchWith) : "all"}
      watchLabel={watchWithLabel()}
      testCopy={testCopy()}
    />
  );
}
