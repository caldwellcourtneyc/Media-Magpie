// Storage layer. Two backends behind one tiny interface:
//   - DATABASE_URL set  -> any Postgres (Neon, Supabase, your own) via `pg`
//   - DATABASE_URL unset -> PGlite, an embedded Postgres that keeps its files in
//     ./data/db (override with LOCAL_DB_DIR). Same SQL, same schema.
// Everything above this file only sees `Db`.

import path from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

export type Row = Record<string, unknown>;

export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run several statements atomically. The callback gets a Db bound to the transaction. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  kind: "pglite" | "postgres";
  close(): Promise<void>;
}

type Holder = { promise?: Promise<Db> };
const g = globalThis as unknown as { __mediaLogDb?: Holder };
const holder: Holder = (g.__mediaLogDb ??= {});

export function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export function localDbDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_DB_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "db"));
}

async function openPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = localDbDir();
  const fs = await import("node:fs");
  fs.mkdirSync(dir, { recursive: true });
  // relaxedDurability stays off (the default): every write is flushed to disk
  // before the query resolves. Slower, and the whole point of this app.
  const pg = await PGlite.create(dir);
  type Q = { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> };
  const wrap = (q: Q, inTx: boolean): Db => ({
    kind: "pglite",
    async query<T>(text: string, params?: unknown[]) {
      const r = await q.query(text, params);
      return r.rows as T[];
    },
    async tx<T>(fn: (db: Db) => Promise<T>) {
      if (inTx) return fn(wrap(q, true));
      return pg.transaction((t) => fn(wrap(t as unknown as Q, true)));
    },
    async close() {
      if (!inTx) await pg.close();
    },
  });
  return wrap(pg as unknown as Q, false);
}

async function openPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  // Date-only columns are stored as text (YYYY-MM-DD), so no timezone parsing
  // surprises. Timestamps come back as Date and are normalized in repo.ts.
  // Hosted Postgres (Neon) drops idle connections when it suspends. Without an error listener that
  // dropped socket is an unhandled error and kills the process; without a connect timeout a stalled
  // connect hangs until the function is killed. Fail fast instead, so the caller sees a clear error.
  const pool = new Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
  pool.on("error", (e) => console.error("postgres: idle connection error (discarded)", e.message));
  type C = { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> };
  const wrap = (c: C, client?: { release: () => void }): Db => ({
    kind: "postgres",
    async query<T>(text: string, params?: unknown[]) {
      const r = await c.query(text, params);
      return r.rows as T[];
    },
    async tx<T>(fn: (db: Db) => Promise<T>) {
      if (client) return fn(wrap(c, client));
      const conn = await pool.connect();
      let broken: Error | undefined;
      try {
        await conn.query("begin");
        const out = await fn(wrap(conn as unknown as C, conn));
        await conn.query("commit");
        return out;
      } catch (e) {
        // If even the rollback fails the connection is unusable: release it as broken so the pool
        // discards it, and surface the original error, not the rollback's.
        await conn.query("rollback").catch((re: Error) => (broken = re));
        throw e;
      } finally {
        conn.release(broken);
      }
    },
    async close() {
      if (!client) await pool.end();
    },
  });
  return wrap(pool as unknown as C);
}

async function migrate(db: Db) {
  // A hosted server starts cold after every idle spell; when the stored version already matches,
  // the setup statements have nothing to do, so skip their round trips. A fresh database has no
  // meta table yet, and that error means "run them".
  const stored = await db
    .query<{ value: string }>(`select value from meta where key = 'schema_version'`)
    .then((r) => r[0]?.value)
    .catch(() => undefined);
  if (stored === String(SCHEMA_VERSION)) return;
  for (const stmt of SCHEMA_SQL) await db.query(stmt);
  await db.query(
    `insert into meta (key, value) values ('schema_version', $1)
     on conflict (key) do update set value = excluded.value`,
    [String(SCHEMA_VERSION)]
  );
}

/**
 * On a serverless host (Vercel, Netlify, AWS Lambda) there is no disk that lasts: the embedded database
 * would fail to open, or worse, keep writes that vanish. Such a copy needs DATABASE_URL, and stays locked
 * until it has one, the way a copy with no password does.
 */
export function needsHostedDb(): boolean {
  return !connectionString() && Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
export const NO_DB_LINE = "This copy runs on a host with no lasting disk, so it needs a hosted Postgres database. Set DATABASE_URL in the host's environment settings and redeploy.";

/** The shared database handle. Opens and migrates on first use, never at import time. */
export function getDb(): Promise<Db> {
  if (!holder.promise) {
    const url = connectionString();
    if (needsHostedDb()) return Promise.reject(new Error(NO_DB_LINE));
    holder.promise = (async () => {
      const db = url ? await openPostgres(url) : await openPglite();
      await migrate(db);
      if (db.kind === "pglite") {
        const { seedIfFresh } = await import("./seed");
        await seedIfFresh(db);
        // A backup on every start, as well as after changes.
        const { scheduleBackup } = await import("./backup");
        scheduleBackup();
      }
      return db;
    })().catch((e) => {
      holder.promise = undefined;
      throw e;
    });
  }
  return holder.promise;
}
