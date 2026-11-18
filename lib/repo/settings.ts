// Settings kept on the server, as JSON in the meta table: Libby libraries and the order of types.

import { z } from "zod";
import { isTypeOrder, LIBBY_MAX, MEDIA_TYPES, typesInOrder, type MediaType } from "../config";
import { getDb, type Db } from "../db";
import { trimmed } from "./inputs";

const LibbyInput = z
  .array(
    z.object({
      key: trimmed(60)
        .transform((s) => s.toLowerCase())
        .pipe(z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "A Libby code is letters, numbers and dashes, like nypl")),
      name: trimmed(40).pipe(z.string().min(1, "Give each library a name")),
    }),
  )
  .max(LIBBY_MAX, `Up to ${LIBBY_MAX} libraries`)
  .refine((l) => new Set(l.map((x) => x.key)).size === l.length, "That library is already on the list");

/** Libby libraries for book links. Kept in meta as JSON; a bad or missing value reads as none. */
export async function getLibby(db0?: Db) {
  const db = db0 ?? (await getDb());
  const rows = await db.query<{ value: string }>(`select value from meta where key = 'libby'`);
  if (!rows[0]) return [];
  try {
    const r = LibbyInput.safeParse(JSON.parse(rows[0].value));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

/** Settings live in the meta table, one row each, as JSON. */
async function saveSetting(key: string, value: unknown) {
  const db = await getDb();
  await db.query(
    `insert into meta (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [key, JSON.stringify(value)],
  );
}

/** Replaces the whole list (the Settings form sends it all). An empty list turns the links off. */
export async function setLibby(raw: unknown) {
  const list = LibbyInput.parse(raw);
  await saveSetting("libby", list);
  return list;
}

const TypeOrderInput = z
  .array(z.enum(MEDIA_TYPES))
  .refine(isTypeOrder, `The order of types lists each of ${MEDIA_TYPES.join(", ")} once`);

/** The order the types are listed in on screen, on every device. Kept in meta as JSON; a bad or missing value reads as the default. */
export async function getTypeOrder(db0?: Db): Promise<MediaType[]> {
  const db = db0 ?? (await getDb());
  const rows = await db.query<{ value: string }>(`select value from meta where key = 'type_order'`);
  try {
    return typesInOrder(rows[0] ? JSON.parse(rows[0].value) : null);
  } catch {
    return [...MEDIA_TYPES];
  }
}

export async function setTypeOrder(raw: unknown) {
  const order = TypeOrderInput.parse(raw);
  await saveSetting("type_order", order);
  return order;
}
