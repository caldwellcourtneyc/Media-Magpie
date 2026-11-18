# Media Magpie: project notes for Claude

A personal media diary (TV, movies, music, podcasts, books): history with rewatches, three-tier favorites, a three-section queue, and captures. **Reliability is the product: nothing logged may ever be lost.** Shareable as an open-source repo, so no personal data or secrets in git, ever.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript, plain CSS (`app/globals.css`, tokens at the top). No Tailwind, no component library.
- Postgres through one tiny interface (`lib/db.ts`): `DATABASE_URL` set = `pg` against any Postgres; unset = PGlite embedded in `./data/db`. Same schema (`lib/schema.ts`), same SQL.
- All reads and writes in `lib/repo/` (zod validation, soft deletes, export/import), one file per kind of thing, exported through `lib/repo.ts`: import from there, not from the folder. API routes in `app/api/**` are thin wrappers using `route()` from `lib/api.ts`.
- Auth: `proxy.ts` + `lib/auth.ts`. Single password (`APP_PASSWORD`), HMAC cookie. Fails closed with no password. Optional `API_TOKEN` bearer, `/api/*` only.
- Lookups (`lib/lookup.ts`) run server-side only. Movies sit behind a provider seam: `MOVIE_API_KEY` = TMDB, else Wikipedia.
- UI is one client app (`components/App.tsx`) that loads `/api/state` and re-fetches after each write. URL holds view, type filter and open item.

## Commands

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run selftest
```

```bash
npm run typecheck
```

```bash
npm run uitest
```

`uitest` clicks through a production build (run `npm run build` first) on a throwaway server with the demo seed, at desktop and phone widths in both color schemes. It needs Playwright and a browser, which the app doesn't depend on: it finds `playwright-core` in `~/.claude/tools` and Chrome on the owner's machine, and the global `playwright` with its own Chromium in a cloud container (`scripts/uitest/browser.mjs`). `scripts/uitest.mjs` runs it; the flows are the numbered files in `scripts/uitest/sections/`, run in file-name order because each builds on the ones before. `selftest` also runs the last production build, so after a code change it tests old code until `npm run build` runs again.

Dev runs on port 3456 (3000 is often taken on the owner's machine). The tests take fixed ports: `selftest` 3996-3999, `uitest` 3995. Keep review or preview servers off them.

In a cloud container (Claude Code on the web), two things differ:

- Node's own `fetch` ignores the proxy unless `NODE_USE_ENV_PROXY=1` is set, so lookups (covers, TVmaze) from a script or a dev server reach nothing without it. The tests don't need it: they use canned lookups (`LOOKUP_FIXTURE`).
- Open Library cover images redirect to archive.org hosts the environment can't reach, so book covers show as title blocks there. That's the network, not a bug.

## Rules that bite

- **Never open the embedded database from two processes.** PGlite is single-process. Scripts talk to a running server through the API, never to `./data/db` directly. Nothing touches the database at import or build time (`getDb()` is lazy; pages are `force-dynamic`).
- **Deletes are soft.** Every table has `deleted_at`; exports include deleted rows. Don't add a hard delete to the app.
- **Schema changes are additive.** Bump `SCHEMA_VERSION` and append idempotent statements; never edit old ones. Bump `EXPORT_VERSION` only with an import path for the old version.
- **Dates are text `YYYY-MM-DD`** (no timezone shifts). `null` means undated and must always display sensibly.
- **The item sheet renders on the server** when the URL has `?item=` (`app/page.tsx` passes `initialItem`). Anything that reads `localStorage` (drafts, remembered choices) must read it in an effect after mount, never in a `useState` initializer, or the page fails to hydrate.
- **No personal data in the repo.** `data/`, `.env.local`, `MORNING.md`, `HANDOFF.md`, `BUILD-PROMPT.md` and `design/` are gitignored. Personal seed files are built outside the repo.
- Neutral env names (`MOVIE_API_KEY`, not a vendor name).
- On Windows, Git Bash rewrites `/api/...` arguments to paths: set `MSYS_NO_PATHCONV=1` when passing API paths to scripts.
- **A parallel session gets its own worktree.** A second session that may touch the same files works in a worktree under `.claude/worktrees/`, never in this checkout. Commit before starting a side session that builds on uncommitted work, or it starts from stale code. When side-session work is still on a branch, say so in the same report as the result: the owner's phone runs `main` until it's merged. Never stop or restart a dev server another session started; ask first, and say where it will run. A worktree session can't edit `HANDOFF.md` (it's gitignored, so it lives only in the main checkout, and the app keeps worktree sessions out of it): write handoff updates to the side-session notes folder and name the file in the report, for the main session to fold in.
- **UI copy and the UI test change together.** A change that renames or moves visible UI updates the UI test (the numbered sections in `scripts/uitest/sections/`) in the same commit; run `npm run build` then `npm run uitest` before calling it done.

## Entering the owner's data

- **Tiers are the owner's call.** Never set Fave or Top Shelf unless they say so. When they hand over things they follow or enjoy (a list of podcasts they listen to, say), add them at Love. Anything going into a queue section, and any finish they log, gets no tier unless they give one (no tier means not rated yet, and the app shows it that way). Not a Fan (`disliked: true`) only on their word.
- Never invent dates or notes. Check for an existing entry (same type, same title) before adding, and report what was already there.

## Design rules (canon: DESIGN.md)

- Structure from the B/D prototype: left nav, main, right rail; Diary home with the year ribbon; phone gets a bottom tab bar with the + in the middle.
- **Color has one job each:** five hues = media type, gold = Top Shelf. No sixth decorative color; buttons and selection use ink inversion. The hues are one bright set in both modes, and text never sits on a hue fill (hue as a swatch or tint instead).
- Dark = B's structure on dark navy (staged gradient), light = D's tokens (cool gray ground, white panel). One font pairing: Schibsted Grotesk + Figtree.
- No shadowed chunky cards with accent bars, no cream ground, no em dashes in UI copy. Use the type-scale tokens; don't add sizes.
