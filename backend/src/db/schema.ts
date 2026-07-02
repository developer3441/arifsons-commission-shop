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

/**
 * Global shop defaults (issue #18) that feed the trade engine's config
 * (ADR-0001/0003/0004/0012): commission rates, default Katt, labour rate,
 * empty-bag (bardana) charge, default cost-bearer, and the flat cess rate.
 * A single row keyed by the fixed id 'default' — Owner-only to change
 * (ADR-0020), enforced at the route layer.
 */
export const shopConfig = sqliteTable('shop_config', {
  id: text('id').primaryKey(),
  farmerCommissionRate: real('farmer_commission_rate').notNull(),
  buyerCommissionRate: real('buyer_commission_rate').notNull(),
  kattKgPerBag: real('katt_kg_per_bag').notNull(),
  perBagLabour: integer('per_bag_labour').notNull(),
  perBagCharge: integer('per_bag_charge').notNull(), // empty-bag (bardana) value per bag
  bagBearer: text('bag_bearer').notNull(), // 'farmer' | 'buyer'
  labourBearer: text('labour_bearer').notNull(), // 'farmer' | 'buyer'
  cessRate: real('cess_rate').notNull(),
})

/**
 * Bardana (empty bag) lending tracker (issue #21, ADR-0001/0010): one row per
 * farmer with bags currently outstanding. This is purely an operational
 * tracker for "bags out per farmer" — the *money* value of an outstanding
 * loan already flows into True Shop Value through the farmer's own ledger
 * balance (lendBardana posts a debit there; see routes/bardana.ts for the
 * full reasoning on why this table is not also fed into the dashboard's
 * separate bardanaOutValue term, to avoid double-counting the same asset).
 */
export const bardanaLoans = sqliteTable('bardana_loans', {
  farmerId: text('farmer_id').primaryKey(),
  bagsOut: integer('bags_out').notNull(),
  bagValue: integer('bag_value').notNull(), // whole PKR per bag, from the most recent lend (ADR-0009)
})

/**
 * A registered Lot (issue #22, ADR-0002/0003): a farmer's arriving produce,
 * given a sequential number, weighed bag by bag. Pre-sale state — a lot has
 * no ledger postings of its own; it only becomes money when it's sold
 * (issue #23, the back half of the New Trade flow).
 */
export const lots = sqliteTable('lots', {
  lotNumber: integer('lot_number').primaryKey({ autoIncrement: true }),
  farmerId: text('farmer_id')
    .notNull()
    .references(() => accounts.id),
  businessDate: text('business_date')
    .notNull()
    .default(sql`(date('now', '+5 hours'))`),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
})

/** One weighed bag belonging to a lot — gross kg as weighed (taulai), ADR-0002. */
export const lotBags = sqliteTable('lot_bags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lotNumber: integer('lot_number')
    .notNull()
    .references(() => lots.lotNumber),
  grossKg: real('gross_kg').notNull(),
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
