import { route } from "@/lib/api";
import { backupDir, backupsEnabled } from "@/lib/backup";
import { getDb } from "@/lib/db";
import { counts } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** GET /api/health — is the database reachable, and how much is in it. Signed-in only. */
export const GET = route(async () => {
  const db = await getDb();
  const seeded = await db.query<{ value: string }>(`select value from meta where key = 'seeded'`);
  return {
    ok: true,
    database: db.kind === "pglite" ? "embedded (local files)" : "postgres (DATABASE_URL)",
    rows: await counts(db),
    seed: seeded[0]?.value ?? null,
    backups: backupsEnabled() ? backupDir() : "off (hosted database)",
  };
});
