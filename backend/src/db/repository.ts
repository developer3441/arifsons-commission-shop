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

import { eq, sql, asc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import type { Account, Entry } from '../domain/posting'
import { type PKR, pkr } from '../domain/money'
import type { ChangeLogRow } from '../domain/corrections'
import { hashPassword } from '../auth/password'
import type { Role } from '../auth/tokens'

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
