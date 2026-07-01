// The ONLY code that touches D1 (see architecture.md dependency rule). It maps
// between domain objects and rows; it holds no business logic. The engine builds
// Entries; the repository persists them append-only and reads balances back as a
// projection of the posting stream (ADR-0010, ADR-0014).

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import type { Account, Entry } from '../domain/posting'
import { type PKR, pkr } from '../domain/money'

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
   */
  async recordEntry(entry: Entry): Promise<void> {
    const rows = entry.postings.map((p) => ({
      entryId: entry.id,
      accountId: p.accountId,
      amount: p.amount as number,
    }))
    await this.db.batch([
      this.db.insert(schema.entries).values({ id: entry.id, kind: entry.kind }),
      this.db.insert(schema.postings).values(rows),
    ])
  }

  /** A ledger balance is the sum of every posting to that account (a projection). */
  async balanceOf(accountId: string): Promise<PKR> {
    const rows = await this.db
      .select({ amount: schema.postings.amount })
      .from(schema.postings)
      .where(eq(schema.postings.accountId, accountId))
    return pkr(rows.reduce((sum, r) => sum + r.amount, 0))
  }
}
