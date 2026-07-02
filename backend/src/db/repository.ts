// The ONLY code that touches D1 (see architecture.md dependency rule). It maps
// between domain objects and rows; it holds no business logic. The engine
// builds Entries; the repository persists them append-only and reads
// balances back as a projection of the posting stream (ADR-0010, ADR-0014).
//
// Append-only is enforced twice: the DB itself rejects UPDATE/DELETE on
// `postings` and `change_log` via triggers (migration 0001, ADR-0021), and
// this class never issues an UPDATE/DELETE against them either. Idempotency
// (ADR-0021) uses the entry's own id as the key: recordEntry is a no-op if
// that id was already persisted.

import { eq, sql, asc, and, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import type { Account, Entry, Posting, LedgerKind, EntryKind } from '../domain/posting'
import type { CostBearer } from '../domain/trade'
import { type PKR, pkr } from '../domain/money'
import type { ChangeLogRow } from '../domain/corrections'
import { hashPassword } from '../auth/password'
import type { Role } from '../auth/tokens'
import { emptyGodown, receiveStock, type GodownState, type StockLot } from '../domain/godown'

export class Repository {
  private readonly db: ReturnType<typeof drizzle<typeof schema>>

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema })
  }

  /** Register an account. Idempotent so singletons (Rokar) can be ensured. */
  async ensureAccount(account: Account): Promise<void> {
    await this.db
      .insert(schema.accounts)
      .values({ id: account.id, kind: account.kind, name: account.name ?? null })
      .onConflictDoNothing()
  }

  /**
   * Append one immutable entry and its postings in a single atomic batch — D1's
   * batch is transactional, so entry + postings commit together or not at all.
   * Idempotent on entry.id (ADR-0021): re-submitting the same id is a safe
   * no-op — it does not double-post, and returns `wasNew: false`.
   *
   * `businessDate` is optional (ADR-0023); omit it to take the column's "today
   * in PKT" default.
   */
  async recordEntry(
    entry: Entry,
    options?: { businessDate?: string; actorUserId?: string },
  ): Promise<{ wasNew: boolean }> {
    const existing = await this.db
      .select({ id: schema.entries.id })
      .from(schema.entries)
      .where(eq(schema.entries.id, entry.id))
      .limit(1)
    if (existing.length > 0) {
      return { wasNew: false }
    }

    const rows = entry.postings.map((p) => ({
      entryId: entry.id,
      accountId: p.accountId,
      amount: p.amount as number,
    }))
    const entryValues: typeof schema.entries.$inferInsert = { id: entry.id, kind: entry.kind }
    if (options?.businessDate) entryValues.businessDate = options.businessDate
    if (options?.actorUserId) entryValues.actorUserId = options.actorUserId

    await this.db.batch([
      this.db.insert(schema.entries).values(entryValues),
      this.db.insert(schema.postings).values(rows),
    ])
    return { wasNew: true }
  }

  /** A ledger balance is the sum of every posting to that account (a projection). */
  async balanceOf(accountId: string): Promise<PKR> {
    const rows = await this.db
      .select({ amount: schema.postings.amount })
      .from(schema.postings)
      .where(eq(schema.postings.accountId, accountId))
    return pkr(rows.reduce((sum, r) => sum + r.amount, 0))
  }

  /**
   * Day-grouped totals for one account, keyed by business date PKT
   * (ADR-0023) — e.g. the daily Rokar count.
   */
  async dailyTotals(accountId: string): Promise<{ businessDate: string; amount: PKR }[]> {
    const rows = await this.db
      .select({
        businessDate: schema.entries.businessDate,
        amount: sql<number>`sum(${schema.postings.amount})`,
      })
      .from(schema.postings)
      .innerJoin(schema.entries, eq(schema.postings.entryId, schema.entries.id))
      .where(eq(schema.postings.accountId, accountId))
      .groupBy(schema.entries.businessDate)
      .orderBy(asc(schema.entries.businessDate))
    return rows.map((r) => ({ businessDate: r.businessDate, amount: pkr(r.amount) }))
  }

  /** Append a change-log row (ADR-0011). Insert-only — the DB also rejects UPDATE/DELETE on it. */
  async recordChangeLog(row: ChangeLogRow): Promise<void> {
    await this.db.insert(schema.changeLog).values({
      id: row.id,
      entryId: row.entryId,
      action: row.action,
      before: JSON.stringify(row.before),
      after: row.after === null ? null : JSON.stringify(row.after),
      actorUserId: row.actor,
    })
  }

  /**
   * Rebuild the full immutable Entry stream from persisted postings
   * (Issue #16) — the same shape the pure domain layer (posting.ts,
   * dashboard.ts) folds over in-memory. Ordered by creation time so
   * day-by-day/first-to-last semantics match how entries were recorded.
   */
  async allEntries(): Promise<Entry[]> {
    const rows = await this.db
      .select({
        entryId: schema.postings.entryId,
        kind: schema.entries.kind,
        createdAt: schema.entries.createdAt,
        accountId: schema.postings.accountId,
        amount: schema.postings.amount,
      })
      .from(schema.postings)
      .innerJoin(schema.entries, eq(schema.postings.entryId, schema.entries.id))
      .orderBy(asc(schema.entries.createdAt))

    const byId = new Map<string, { id: string; kind: EntryKind; postings: Posting[] }>()
    for (const row of rows) {
      let entry = byId.get(row.entryId)
      if (!entry) {
        entry = { id: row.entryId, kind: row.kind as EntryKind, postings: [] }
        byId.set(row.entryId, entry)
      }
      entry.postings.push({ accountId: row.accountId, amount: pkr(row.amount) })
    }
    return [...byId.values()]
  }

  /** All registered accounts of one ledger kind — e.g. every Zamindar (farmer) account. */
  async accountsByKind(kind: LedgerKind): Promise<Account[]> {
    const rows = await this.db.select().from(schema.accounts).where(eq(schema.accounts.kind, kind))
    return rows.map((r) => ({ id: r.id, kind: r.kind as LedgerKind, name: r.name ?? undefined }))
  }

  /**
   * Create or edit a Contact (farmer/buyer/contractor, issue #17): the account
   * plus its optional per-customer overrides (ADR-0001/0003/0012). Upsert on
   * id so the same form serves both create and edit.
   */
  async upsertContact(input: {
    id: string
    kind: LedgerKind
    name?: string
    commissionRate?: number
    buyerCommissionRate?: number
    bagBearer?: CostBearer
    labourBearer?: CostBearer
    kattKgPerBag?: number
  }): Promise<void> {
    const values = {
      id: input.id,
      kind: input.kind,
      name: input.name ?? null,
      commissionRate: input.commissionRate ?? null,
      buyerCommissionRate: input.buyerCommissionRate ?? null,
      bagBearer: input.bagBearer ?? null,
      labourBearer: input.labourBearer ?? null,
      kattKgPerBag: input.kattKgPerBag ?? null,
    }
    await this.db
      .insert(schema.accounts)
      .values(values)
      .onConflictDoUpdate({ target: schema.accounts.id, set: values })
  }

  /** One contact, with its running balance (a projection of the posting stream). */
  async getContact(id: string): Promise<ContactRecord | undefined> {
    const rows = await this.db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).limit(1)
    const row = rows[0]
    if (!row) return undefined
    return { ...toContactRecord(row), balance: await this.balanceOf(id) }
  }

  /** Search contacts of one kind by name (case-insensitive substring) — the Contacts screen list. */
  async listContacts(kind: LedgerKind, query?: string): Promise<ContactRecord[]> {
    const conditions = [eq(schema.accounts.kind, kind)]
    if (query) conditions.push(like(sql`lower(${schema.accounts.name})`, `%${query.toLowerCase()}%`))
    const rows = await this.db
      .select()
      .from(schema.accounts)
      .where(and(...conditions))
    return Promise.all(
      rows.map(async (row) => ({ ...toContactRecord(row), balance: await this.balanceOf(row.id) })),
    )
  }
}

export interface ContactRecord {
  id: string
  kind: LedgerKind
  name?: string
  commissionRate?: number
  buyerCommissionRate?: number
  bagBearer?: CostBearer
  labourBearer?: CostBearer
  kattKgPerBag?: number
  balance: PKR
}

function toContactRecord(row: typeof schema.accounts.$inferSelect): Omit<ContactRecord, 'balance'> {
  return {
    id: row.id,
    kind: row.kind as LedgerKind,
    name: row.name ?? undefined,
    commissionRate: row.commissionRate ?? undefined,
    buyerCommissionRate: row.buyerCommissionRate ?? undefined,
    bagBearer: (row.bagBearer as CostBearer | null) ?? undefined,
    labourBearer: (row.labourBearer as CostBearer | null) ?? undefined,
    kattKgPerBag: row.kattKgPerBag ?? undefined,
  }
}

export interface UserRecord {
  id: string
  name: string
  username: string
  role: Role
  active: boolean
}

/** A thin wrapper so callers never see the password hash outside this module. */
function toUserRecord(row: { id: string; name: string; username: string; role: string; active: boolean }): UserRecord {
  return { id: row.id, name: row.name, username: row.username, role: row.role as Role, active: row.active }
}

/**
 * Shop-staff user management (ADR-0020/0025). Only Owner-gated routes call
 * these — RBAC itself is enforced at the route layer, not here.
 */
export class UserRepository {
  private readonly db: ReturnType<typeof drizzle<typeof schema>>

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema })
  }

  /** Create a user with a hashed password. Throws if the username is already taken. */
  async createUser(id: string, name: string, username: string, password: string, role: Role): Promise<UserRecord> {
    const passwordHash = await hashPassword(password)
    await this.db.insert(schema.users).values({ id, name, username, passwordHash, role, active: true })
    return { id, name, username, role, active: true }
  }

  async listUsers(): Promise<UserRecord[]> {
    const rows = await this.db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        username: schema.users.username,
        role: schema.users.role,
        active: schema.users.active,
      })
      .from(schema.users)
    return rows.map(toUserRecord)
  }

  /** Find a user by username, including their password hash — for login only. */
  async findByUsername(
    username: string,
  ): Promise<(UserRecord & { passwordHash: string }) | undefined> {
    const rows = await this.db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1)
    const row = rows[0]
    if (!row) return undefined
    return { ...toUserRecord(row), passwordHash: row.passwordHash }
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const rows = await this.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
    const row = rows[0]
    return row ? toUserRecord(row) : undefined
  }

  /** Deactivate a user — they can no longer log in (existing tokens still work until they expire, ADR-0025). */
  async deactivateUser(id: string): Promise<void> {
    await this.db.update(schema.users).set({ active: false }).where(eq(schema.users.id, id))
  }
}

const SHOP_CONFIG_ID = 'default'

export interface ShopConfigRecord {
  farmerCommissionRate: number
  buyerCommissionRate: number
  kattKgPerBag: number
  perBagLabour: number
  perBagCharge: number
  bagBearer: CostBearer
  labourBearer: CostBearer
  cessRate: number
}

/** Sensible out-of-the-box defaults, returned when no config has been saved yet. */
const DEFAULT_SHOP_CONFIG: ShopConfigRecord = {
  farmerCommissionRate: 0.02,
  buyerCommissionRate: 0,
  kattKgPerBag: 1.5,
  perBagLabour: 0,
  perBagCharge: 0,
  bagBearer: 'farmer',
  labourBearer: 'farmer',
  cessRate: 0,
}

function toShopConfigRecord(row: typeof schema.shopConfig.$inferSelect): ShopConfigRecord {
  return {
    farmerCommissionRate: row.farmerCommissionRate,
    buyerCommissionRate: row.buyerCommissionRate,
    kattKgPerBag: row.kattKgPerBag,
    perBagLabour: row.perBagLabour,
    perBagCharge: row.perBagCharge,
    bagBearer: row.bagBearer as CostBearer,
    labourBearer: row.labourBearer as CostBearer,
    cessRate: row.cessRate,
  }
}

/**
 * Global shop defaults (issue #18, ADR-0001/0003/0004/0012) — a single row
 * that feeds the trade engine's TradeConfig. Owner-only to change; that's
 * enforced at the route layer (ADR-0020), not here.
 */
export class ConfigRepository {
  private readonly db: ReturnType<typeof drizzle<typeof schema>>

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema })
  }

  /** The current config, or the built-in defaults if nothing has been saved yet. */
  async getConfig(): Promise<ShopConfigRecord> {
    const rows = await this.db
      .select()
      .from(schema.shopConfig)
      .where(eq(schema.shopConfig.id, SHOP_CONFIG_ID))
      .limit(1)
    const row = rows[0]
    return row ? toShopConfigRecord(row) : DEFAULT_SHOP_CONFIG
  }

  /** Merge a partial update into the current config (defaults for anything unset) and persist it. */
  async setConfig(update: Partial<ShopConfigRecord>): Promise<ShopConfigRecord> {
    const current = await this.getConfig()
    const merged: ShopConfigRecord = { ...current, ...update }
    const values = { id: SHOP_CONFIG_ID, ...merged }
    await this.db.insert(schema.shopConfig).values(values).onConflictDoUpdate({
      target: schema.shopConfig.id,
      set: values,
    })
    return merged
  }
}

export interface BardanaLoanRecord {
  farmerId: string
  bagsOut: number
  bagValue: PKR
}

export class InsufficientBagsError extends Error {
  constructor(available: number, requested: number) {
    super(`Cannot return more bags than are outstanding: outstanding ${available}, requested ${requested}`)
    this.name = 'InsufficientBagsError'
  }
}

function toBardanaLoanRecord(row: typeof schema.bardanaLoans.$inferSelect): BardanaLoanRecord {
  return { farmerId: row.farmerId, bagsOut: row.bagsOut, bagValue: pkr(row.bagValue) }
}

/**
 * Bardana lending tracker (issue #21) — "bags out per farmer", separate from
 * the money side (which already flows through the farmer's ledger balance
 * via the domain lendBardana()/resolveBardanaLoan() postings; see
 * routes/bardana.ts for why this table isn't also fed into the dashboard's
 * bardanaOutValue term).
 */
export class BardanaRepository {
  private readonly db: ReturnType<typeof drizzle<typeof schema>>

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema })
  }

  async getLoan(farmerId: string): Promise<BardanaLoanRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.bardanaLoans)
      .where(eq(schema.bardanaLoans.farmerId, farmerId))
      .limit(1)
    const row = rows[0]
    return row ? toBardanaLoanRecord(row) : undefined
  }

  /** Every farmer with bags currently outstanding — the tracker screen's list. */
  async listOutstanding(): Promise<BardanaLoanRecord[]> {
    const rows = await this.db.select().from(schema.bardanaLoans).where(sql`${schema.bardanaLoans.bagsOut} > 0`)
    return rows.map(toBardanaLoanRecord)
  }

  /** Lend more bags to a farmer: bags-out increases; bagValue is remembered for the next return. */
  async lend(farmerId: string, bags: number, bagValue: PKR): Promise<BardanaLoanRecord> {
    const current = await this.getLoan(farmerId)
    const bagsOut = (current?.bagsOut ?? 0) + bags
    await this.db
      .insert(schema.bardanaLoans)
      .values({ farmerId, bagsOut, bagValue })
      .onConflictDoUpdate({ target: schema.bardanaLoans.farmerId, set: { bagsOut, bagValue } })
    return { farmerId, bagsOut, bagValue }
  }

  /** Return bags: bags-out decreases. Throws InsufficientBagsError if more bags are returned than are out. */
  async returnBags(farmerId: string, bags: number): Promise<BardanaLoanRecord> {
    const current = await this.getLoan(farmerId)
    const outstanding = current?.bagsOut ?? 0
    if (bags > outstanding) {
      throw new InsufficientBagsError(outstanding, bags)
    }
    const bagsOut = outstanding - bags
    const bagValue = current?.bagValue ?? pkr(0)
    await this.db
      .insert(schema.bardanaLoans)
      .values({ farmerId, bagsOut, bagValue })
      .onConflictDoUpdate({ target: schema.bardanaLoans.farmerId, set: { bagsOut } })
    return { farmerId, bagsOut, bagValue }
  }
}

export interface LotRecord {
  lotNumber: number
  farmerId: string
  businessDate: string
  bags: { grossKg: number }[]
}

/**
 * Lot registration and weighing (issue #22, ADR-0002/0003) — the front half
 * of the New Trade flow. A lot has no ledger postings of its own; it becomes
 * money only when sold (issue #23).
 */
export class LotRepository {
  private readonly db: ReturnType<typeof drizzle<typeof schema>>

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema })
  }

  /** Register a new lot against a farmer. The lot number is sequential (SQLite autoincrement). */
  async createLot(
    farmerId: string,
    businessDate?: string,
  ): Promise<{ lotNumber: number; farmerId: string; businessDate: string }> {
    const values: typeof schema.lots.$inferInsert = { farmerId }
    if (businessDate) values.businessDate = businessDate
    const [row] = await this.db
      .insert(schema.lots)
      .values(values)
      .returning({ lotNumber: schema.lots.lotNumber, businessDate: schema.lots.businessDate })
    return { lotNumber: row!.lotNumber, farmerId, businessDate: row!.businessDate }
  }

  /** Record one weighed bag's gross kg against a lot. */
  async addBag(lotNumber: number, grossKg: number): Promise<void> {
    await this.db.insert(schema.lotBags).values({ lotNumber, grossKg })
  }

  /** One lot with every bag weighed against it so far, in weighing order. */
  async getLot(lotNumber: number): Promise<LotRecord | undefined> {
    const lotRows = await this.db.select().from(schema.lots).where(eq(schema.lots.lotNumber, lotNumber)).limit(1)
    const lot = lotRows[0]
    if (!lot) return undefined
    const bagRows = await this.db
      .select({ grossKg: schema.lotBags.grossKg })
      .from(schema.lotBags)
      .where(eq(schema.lotBags.lotNumber, lotNumber))
      .orderBy(asc(schema.lotBags.id))
    return { lotNumber: lot.lotNumber, farmerId: lot.farmerId, businessDate: lot.businessDate, bags: bagRows }
  }

  /** Every lot, optionally filtered to one farmer — newest first (for picking a lot to sell, issue #23). */
  async listLots(farmerId?: string): Promise<Pick<LotRecord, 'lotNumber' | 'farmerId' | 'businessDate'>[]> {
    const rows = farmerId
      ? await this.db.select().from(schema.lots).where(eq(schema.lots.farmerId, farmerId))
      : await this.db.select().from(schema.lots)
    return rows
      .map((r) => ({ lotNumber: r.lotNumber, farmerId: r.farmerId, businessDate: r.businessDate }))
      .sort((a, b) => b.lotNumber - a.lotNumber)
  }
}


const GODOWN_STATE_ID = 'default'

/**
 * The Godown/Mal Khata running state (issue #28, ADR-0005) — a single row,
 * folded through the pure domain/godown.ts on each house purchase (and
 * later, resale — issue #29). Same "operational aggregate persisted
 * alongside the stream" treatment as BardanaRepository above.
 */
export class GodownRepository {
  private readonly db: ReturnType<typeof drizzle<typeof schema>>

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema })
  }

  /** The current Godown state, or empty if no stock has ever been received. */
  async getState(): Promise<GodownState> {
    const rows = await this.db
      .select()
      .from(schema.godownState)
      .where(eq(schema.godownState.id, GODOWN_STATE_ID))
      .limit(1)
    const row = rows[0]
    return row ? { bags: row.bags, netKg: row.netKg, totalCostBasis: pkr(row.totalCostBasis) } : emptyGodown()
  }

  /** Receive a new stock lot (a house purchase), folding it into the running totals. */
  async receiveStock(lot: StockLot): Promise<GodownState> {
    const current = await this.getState()
    const next = receiveStock(current, lot)
    const values = { id: GODOWN_STATE_ID, bags: next.bags, netKg: next.netKg, totalCostBasis: next.totalCostBasis }
    await this.db.insert(schema.godownState).values(values).onConflictDoUpdate({
      target: schema.godownState.id,
      set: values,
    })
    return next
  }
}
