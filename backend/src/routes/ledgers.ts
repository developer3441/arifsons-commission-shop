// Thin HTTP boundary (architecture.md): read the persisted posting stream +
// account register → fold through the pure domain layer (dashboard.ts) →
// respond. Issue #31: the Ledgers grid — all 7 ledgers as colour-coded
// cards, drilling into one ledger's accounts, then into one account's
// entries (ADR-0004/0010).

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository } from '../db/repository'
import { accountStatement } from '../domain/dashboard'
import { type LedgerKind, ROKAR_ID, REVENUE_ID, GOVERNMENT_ID, sumBalancesOf } from '../domain/posting'
import { requireAuth, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const ledgers = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

ledgers.use('/ledgers', requireAuth)
ledgers.use('/ledgers/*', requireAuth)

// The 7 ledgers, in the fixed order they're always presented (ADR-0004) —
// same set routes/dashboard.ts uses.
const LEDGER_KINDS: readonly LedgerKind[] = ['rokar', 'zamindar', 'beopari', 'thekedar', 'pakka', 'revenue', 'government']

/** The three singleton ledgers' fixed account ids — they may have no `accounts` row yet on a fresh shop. */
const SINGLETON_ID: Partial<Record<LedgerKind, string>> = { rokar: ROKAR_ID, revenue: REVENUE_ID, government: GOVERNMENT_ID }

const ledgerSummarySchema = z.object({ kind: z.string(), balance: z.number().int() })
const accountSummarySchema = z.object({ id: z.string(), name: z.string().optional(), balance: z.number().int() })
const statementLineSchema = z.object({ entryId: z.string(), kind: z.string(), amount: z.number().int(), balanceAfter: z.number().int() })

// --- all 7 ledgers, colour-coded cards on the Ledgers screen ---
ledgers.openapi(
  createRoute({
    method: 'get',
    path: '/ledgers',
    responses: {
      200: { description: 'The 7 ledgers with their balances', content: { 'application/json': { schema: z.array(ledgerSummarySchema) } } },
    },
  }),
  async (c) => {
    const repo = new Repository(c.env.DB)
    const stream = await repo.allEntries()
    const idsByKind = await accountIdsByKind(repo)
    const body = LEDGER_KINDS.map((kind) => ({ kind, balance: sumBalancesOf(stream, idsByKind[kind]) }))
    return c.json(body, 200)
  },
)

// --- the accounts within one ledger kind (tapping a card) ---
ledgers.openapi(
  createRoute({
    method: 'get',
    path: '/ledgers/{kind}/accounts',
    request: { params: z.object({ kind: z.string() }) },
    responses: {
      200: { description: "This ledger's accounts and their balances", content: { 'application/json': { schema: z.array(accountSummarySchema) } } },
      400: { description: 'Not one of the 7 ledger kinds' },
    },
  }),
  async (c) => {
    const { kind } = c.req.valid('param')
    if (!LEDGER_KINDS.includes(kind as LedgerKind)) {
      return c.json({ error: `Not one of the 7 ledgers: ${LEDGER_KINDS.join(', ')}` }, 400)
    }
    const repo = new Repository(c.env.DB)
    const singletonId = SINGLETON_ID[kind as LedgerKind]
    if (singletonId) {
      const balance = await repo.balanceOf(singletonId)
      return c.json([{ id: singletonId, balance }], 200)
    }
    const accounts = await repo.accountsByKind(kind as LedgerKind)
    const withBalances = await Promise.all(
      accounts.map(async (a) => ({ id: a.id, name: a.name, balance: await repo.balanceOf(a.id) })),
    )
    return c.json(withBalances, 200)
  },
)

// --- drill down into one account: every entry that touched it, running balance ---
ledgers.openapi(
  createRoute({
    method: 'get',
    path: '/ledgers/accounts/{id}/entries',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: 'Every entry that touched this account, in order, with a running balance',
        content: { 'application/json': { schema: z.object({ accountId: z.string(), balance: z.number().int(), entries: z.array(statementLineSchema) }) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const repo = new Repository(c.env.DB)
    const stream = await repo.allEntries()
    const entries = accountStatement(stream, id)
    return c.json({ accountId: id, balance: await repo.balanceOf(id), entries }, 200)
  },
)

async function accountIdsByKind(repo: Repository): Promise<Record<LedgerKind, readonly string[]>> {
  const [zamindarAccounts, pakkaAccounts, thekedarAccounts, beopariAccounts] = await Promise.all([
    repo.accountsByKind('zamindar'),
    repo.accountsByKind('pakka'),
    repo.accountsByKind('thekedar'),
    repo.accountsByKind('beopari'),
  ])
  return {
    rokar: [ROKAR_ID],
    zamindar: zamindarAccounts.map((a) => a.id),
    beopari: beopariAccounts.map((a) => a.id),
    thekedar: thekedarAccounts.map((a) => a.id),
    pakka: pakkaAccounts.map((a) => a.id),
    revenue: [REVENUE_ID],
    government: [GOVERNMENT_ID],
  }
}
