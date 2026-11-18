// The example titles on the empty library's ghost shelf (components/Welcome.tsx). Edit this list
// freely: it is the only place they live. No image files or image links belong here; each cover
// is looked up live through /api/lookup when the welcome shows, and a title that finds none
// gets the app's usual missing-cover tile. Examples are never saved as items.

import type { MediaType } from "./config";

/**
 * year is optional: it settles which result is meant when a title has remakes or namesakes.
 * creator, when given, must appear in the result's creator, so a namesake by someone else never
 * lends its cover. match is the title the lookup sites use when it differs from the one shown, and
 * q what to search for when the title alone doesn't find it (both default to the title).
 */
export type Example = { type: MediaType; title: string; year?: number; creator?: string; match?: string; q?: string };

// The first six show on a desk, the first three on a phone.
export const EXAMPLES: Example[] = [
  { type: "tv", title: "Severance", year: 2022 },
  { type: "movie", title: "Everything Everywhere All at Once", year: 2022 },
  { type: "book", title: "Station Eleven", creator: "Emily St. John Mandel" },
  { type: "podcast", title: "99% Invisible", creator: "Roman Mars" },
  { type: "tv", title: "Fleabag", year: 2016 },
  { type: "book", title: "The Night Circus", creator: "Erin Morgenstern" },
  { type: "music", title: "Foo Fighters", creator: "Foo Fighters", year: 1995 },
  { type: "music", title: "Rumours", creator: "Fleetwood Mac", year: 1977 },
  { type: "podcast", title: "Armchair Expert", match: "Armchair Expert with Dax Shepard", creator: "Armchair Umbrella" },
  { type: "movie", title: "Spider-Man: Across the Spider-Verse", year: 2023 },
];
