// Drizzle schema = the schema source of truth (ADR-0014). Money is stored as an
// integer of whole PKR rupees (ADR-0009). The postings table is append-only —
// the 7 ledgers are projections computed from it, never written directly (ADR-0010).

import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  name: text('name'),
})

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
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
