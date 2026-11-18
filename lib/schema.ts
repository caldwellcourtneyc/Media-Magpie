// One schema for both backends. Statements are idempotent, so they run on every
// boot. When the shape changes, bump SCHEMA_VERSION and append new statements
// (alter table ... add column if not exists ...) rather than editing old ones.

export const SCHEMA_VERSION = 9;

const DATE = `~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`;

export const SCHEMA_SQL: string[] = [
  `create table if not exists meta (
    key text primary key,
    value text not null
  )`,

  // One row per thing: a show, film, album, podcast or book. A "creator" row is a
  // favorite artist or author with no specific work picked yet.
  `create table if not exists items (
    id text primary key,
    type text not null check (type in ('tv','movie','music','podcast','book')),
    entity text not null default 'work' check (entity in ('work','creator')),
    title text not null,
    creator text,
    year integer,
    cover_url text,
    lookup_source text,
    lookup_id text,
    tier text check (tier in ('love','fave','top')),
    queue text check (queue in ('in_progress','up_next','saved')),
    queued_at timestamptz,
    progress text,
    tags jsonb not null default '[]'::jsonb,
    origin text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
  )`,

  // One row per finish. A rewatch or reread is another row, never an overwrite.
  // finished_on is null for imported history with no known date.
  `create table if not exists logs (
    id text primary key,
    item_id text not null references items(id),
    finished_on text check (finished_on is null or finished_on ${DATE}),
    detail text,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
  )`,

  // Things you liked. Attached to an item, or standalone with a free-text source.
  // kind is checked in the app (lib/config.ts), not here, so new kinds need no migration.
  `create table if not exists captures (
    id text primary key,
    kind text not null default 'quote',
    body text not null,
    item_id text references items(id),
    media_type text check (media_type is null or media_type in ('tv','movie','music','podcast','book')),
    who text,
    source text,
    url text,
    note text,
    tags jsonb not null default '[]'::jsonb,
    captured_on text check (captured_on is null or captured_on ${DATE}),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
  )`,

  `create index if not exists logs_item_idx on logs(item_id)`,
  `create index if not exists captures_item_idx on captures(item_id)`,
  `create index if not exists items_type_idx on items(type)`,

  // v2: where a queued show or film streams (service keys from lib/config.ts).
  `alter table items add column if not exists watch_on jsonb not null default '[]'::jsonb`,

  // v3: things you follow rather than finish (statuses in lib/config.ts; empty on a
  // podcast, artist or author means following), seasons seen for TV, and where in the
  // item a capture came from (episode, track, page).
  `alter table items add column if not exists status text check (status is null or status in ('following','paused','dropped','ended','done'))`,
  `alter table items add column if not exists seasons_seen integer check (seasons_seen is null or seasons_seen between 0 and 200)`,
  `alter table captures add column if not exists detail text`,

  // v4: Coming Soon. disliked marks something you didn't like (everything else in the
  // library counts as liked). soon_hidden is the season you hid from Coming Soon ("s2"), so
  // the next season brings the show back. air_info caches TVmaze's next air dates, refreshed
  // about twice a day (lib/airdates.ts); it is derived, never your data.
  `alter table items add column if not exists disliked boolean not null default false`,
  `alter table items add column if not exists soon_hidden text`,
  `alter table items add column if not exists air_info jsonb`,
  `alter table items add column if not exists air_checked_at timestamptz`,

  // v5: capture upgrades. talk is your "Talk about it" switch; after a talk, talked_on is the date
  // and talk_note is Claude's one line on where it landed (never mixed into your note). at_time is
  // where in the episode or film it came from ("13:09"). A capture with an empty body is a mark,
  // saved to finish later.
  `alter table captures add column if not exists talk boolean not null default false`,
  `alter table captures add column if not exists talked_on text check (talked_on is null or talked_on ${DATE})`,
  `alter table captures add column if not exists talk_note text`,
  `alter table captures add column if not exists at_time text`,
  // One image per capture, shrunk on your device before upload and kept in the database so
  // exports and backups stay whole. Replacing or removing one is a soft delete, like everything.
  `create table if not exists capture_images (
    id text primary key,
    capture_id text not null references captures(id),
    mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
    data bytea not null,
    bytes integer not null,
    width integer,
    height integer,
    created_at timestamptz not null default now(),
    deleted_at timestamptz
  )`,
  `create index if not exists capture_images_capture_idx on capture_images(capture_id)`,
  `create unique index if not exists capture_images_live_idx on capture_images(capture_id) where deleted_at is null`,

  // v6: by_claude marks a capture whose words Claude wrote (finishing a mark for you), so your words
  // and Claude's can always be told apart. Words you agreed on with Claude don't get it.
  `alter table captures add column if not exists by_claude boolean not null default false`,

  // v7: movie release dates, so movies join Coming soon. Shows get theirs from TVmaze; a movie's is
  // set by hand or by a script from a source it read, never guessed. soon_hidden "release"
  // hides a movie from Coming soon.
  `alter table items add column if not exists release_on text check (release_on is null or release_on ${DATE})`,

  // v8: your own order in a queue section. Set only on something you moved, on the same scale as
  // queued_at in milliseconds, so everything unmoved keeps its place by date (lib/order.ts).
  `alter table items add column if not exists sort_pos double precision`,

  // v9: a cover lookup that got no answer (the site was down, or refusing a burst of requests) is tried
  // again later (lib/covers.ts). cover_retry_at is when the next try is due, null when none is; cover_tries
  // counts the misses so far, so the tries spread out and then stop. Like air_checked_at, neither is exported.
  `alter table items add column if not exists cover_retry_at timestamptz`,
  `alter table items add column if not exists cover_tries integer not null default 0`,
];
