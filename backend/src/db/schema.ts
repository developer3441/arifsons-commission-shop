// Drizzle schema = the schema source of truth (ADR-0014). Money is stored as an
// integer of whole PKR rupees (ADR-0009). `postings` and `change_log` are
// append-only: the migration that creates them also adds DB triggers that
// reject UPDATE/DELETE (ADR-0021) — enforcement lives in SQL, not just here.
// The 7 ledgers are projections computed by folding `postings`, never written
// directly (ADR-0010).

import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  name: text('name'),
})

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(), // also the idempotency key (ADR-0021)
  kind: text('kind').notNull(),
  // Business date the entry belongs to (ADR-0023) — defaults to "today" in PKT
  // (UTC+5, no DST): unixepoch is UTC seconds, shifting by 5h before taking the
  // date lands it on the correct PKT calendar day.
  businessDate: text('business_date')
    .notNull()
    .default(sql`(date('now', '+5 hours'))`),
  // True wall-clock recording time (UTC), distinct from businessDate (ADR-0023).
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
})

export const postings = sqliteTable('postings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entryId: text('entry_id')
    .notNull()
    .references(() => entries.id),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  amount: integer('amount').notNull(), // signed whole PKR (ADR-0009)
})

/**
 * The append-only audit trail for corrections (ADR-0011): one row per
 * edit/delete, never rewritten. `before`/`after` are JSON-serialised Entry
 * snapshots; `after` is null for a delete. `actorUserId` is a plain id for
 * now — issue #15 adds the users table and wires real auth on top.
 */
export const changeLog = sqliteTable('change_log', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull(),
  action: text('action').notNull(), // 'edit' | 'delete'
  before: text('before').notNull(), // JSON
  after: text('after'), // JSON, null for a delete
  actorUserId: text('actor_user_id').notNull(),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
})
