// Issue #32 — daily D1 -> R2 backup export (ADR-0024). D1's built-in Time
// Travel covers point-in-time recovery within ~30 days; this gives a
// durable, off-database copy beyond that window. Programmatic only — no
// route, no screen (the Cron trigger + the R2 objects it writes are the
// whole delivery surface).
//
// The export is a logical JSON snapshot of every table. The append-only
// stream (entries/postings/change_log — ADR-0021) is the ledger's source of
// truth, but a real disaster-recovery snapshot also needs the supporting
// state that is *not* a projection of that stream (accounts, users, shop
// config, bardana loans, Godown state, lots) — so all 10 tables are
// exported, restorable by replaying the rows back in.

import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'

export interface BackupSnapshot {
  exportedAt: string
  tables: {
    users: (typeof schema.users.$inferSelect)[]
    accounts: (typeof schema.accounts.$inferSelect)[]
    shopConfig: (typeof schema.shopConfig.$inferSelect)[]
    bardanaLoans: (typeof schema.bardanaLoans.$inferSelect)[]
    lots: (typeof schema.lots.$inferSelect)[]
    lotBags: (typeof schema.lotBags.$inferSelect)[]
    entries: (typeof schema.entries.$inferSelect)[]
    postings: (typeof schema.postings.$inferSelect)[]
    changeLog: (typeof schema.changeLog.$inferSelect)[]
    godownState: (typeof schema.godownState.$inferSelect)[]
  }
}

/** Read every row of every table — a complete, self-consistent snapshot (ADR-0021/0024). */
export async function buildBackupSnapshot(d1: D1Database, now: Date = new Date()): Promise<BackupSnapshot> {
  const db = drizzle(d1, { schema })
  const [users, accounts, shopConfig, bardanaLoans, lots, lotBags, entries, postings, changeLog, godownState] =
    await Promise.all([
      db.select().from(schema.users),
      db.select().from(schema.accounts),
      db.select().from(schema.shopConfig),
      db.select().from(schema.bardanaLoans),
      db.select().from(schema.lots),
      db.select().from(schema.lotBags),
      db.select().from(schema.entries),
      db.select().from(schema.postings),
      db.select().from(schema.changeLog),
      db.select().from(schema.godownState),
    ])
  return {
    exportedAt: now.toISOString(),
    tables: { users, accounts, shopConfig, bardanaLoans, lots, lotBags, entries, postings, changeLog, godownState },
  }
}

/** One R2 object per calendar day (UTC) — a same-day retry overwrites, rather than duplicating. */
export function backupObjectKey(exportedAt: Date): string {
  return `backups/${exportedAt.toISOString().slice(0, 10)}.json`
}

/** Build the snapshot and write it to R2 — the whole daily backup job (issue #32). */
export async function runDailyBackup(
  d1: D1Database,
  bucket: R2Bucket,
  now: Date = new Date(),
): Promise<{ key: string; bytes: number }> {
  const snapshot = await buildBackupSnapshot(d1, now)
  const body = JSON.stringify(snapshot)
  const key = backupObjectKey(now)
  await bucket.put(key, body, { httpMetadata: { contentType: 'application/json' } })
  return { key, bytes: body.length }
}
