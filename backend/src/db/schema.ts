// Drizzle schema = the schema source of truth (ADR-0014). Money is stored as an
// integer of whole PKR rupees (ADR-0009). `postings` and `change_log` are
// append-only: the migration that creates them also adds DB triggers that
// reject UPDATE/DELETE (ADR-0021) — enforcement lives in SQL, not just here.
// The 7 ledgers are projections computed by folding `postings`, never written
// directly (ADR-0010).

import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

/**
 * Shop staff — the only logins (ADR-0020). Farmers/buyers/contractors are
 * accounts/customers, never users. Password is PBKDF2 `salt:hash` (ADR-0025),
 * never plaintext.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), // 'owner' | 'bookkeeper' | 'viewer'
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
})

/**
 * Farmers (Zamindar), buyers (Pakka), and contractors (Thekedar) as customer
 * accounts (ADR-0007), plus the singleton Rokar/revenue/government/house
 * accounts. The override columns are all nullable -- per-customer overrides
 * on commission/cost-bearer/Katt (ADR-0001/0003/0012, issue #17). Precedence
 * is enforced in the domain layer (trade.ts): per-invoice > per-customer >
 * global default; these columns feed the "per-customer" tier only.
 */
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  name: text('name'),
  // Zamindar-only: overrides TradeConfig.farmerCommissionRate for this farmer.
  commissionRate: real('commission_rate'),
  // Pakka-only: overrides TradeConfig.buyerCommissionRate for this buyer.
  buyerCommissionRate: real('buyer_commission_rate'),
  // Zamindar-only: overrides TradeConfig.bagBearer for this farmer.
  bagBearer: text('bag_bearer'), // 'farmer' | 'buyer'
  // Zamindar-only: overrides TradeConfig.labourBearer for this farmer.
  labourBearer: text('labour_bearer'), // 'farmer' | 'buyer'
  // Zamindar-only: overrides TradeConfig.kattKgPerBag for this farmer.
  kattKgPerBag: real('katt_kg_per_bag'),
})

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(), // also the idempotency key (ADR-0021)
  kind: text('kind').notNull(),
  // The authenticated user who posted this entry (ADR-0020). 'system' is a
  // migration-only placeholder for rows written before auth existed.
  actorUserId: text('actor_user_id').notNull().default('system'),
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
