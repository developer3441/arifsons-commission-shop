// Thin HTTP boundary (architecture.md): assemble the persisted posting stream
// and account register, fold it through the pure domain layer (dashboard.ts),
// respond. No business logic lives here — cashInHand/trueShopValue/reconcile
// are the same pure functions the domain tests exercise in-memory.
//
// Issue #16. Bardana lending (#21) and Godown resale (#28/#29) have no HTTP
// routes yet, so those two True Shop Value terms are genuinely zero for now
// (no bags have been lent, no house stock bought, through the API) — this
// route will start passing real data for them the moment those issues land.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository } from '../db/repository'
import { cashInHand, trueShopValue, reconcile } from '../domain/dashboard'
import { emptyGodown } from '../domain/godown'
import { type LedgerKind, ROKAR_ID, REVENUE_ID, GOVERNMENT_ID, sumBalancesOf } from '../domain/posting'
import { type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const dashboard = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

const money = z.number().int()

const breakdownSchema = z.object({
  cash: money,
  buyerReceivables: money,
  farmerReceivables: money,
  godownValue: money,
  bardanaOutValue: money,
  farmerPayoutsOwed: money,
  outstandingLabour: money,
  cessHeld: money,
  total: money,
})

const reconciliationSchema = z.object({
  trueShopValue: money,
  expected: money,
  drift: money,
  reconciles: z.boolean(),
})

const ledgerBalanceSchema = z.object({ kind: z.string(), balance: money })

const dashboardResponse = z.object({
  cashInHand: money,
  trueShopValue: money,
  breakdown: breakdownSchema,
  reconciliation: reconciliationSchema,
  ledgers: z.array(ledgerBalanceSchema),
})

// The 7 ledgers, in the fixed order they're always presented (ADR-0004).
const LEDGER_KINDS: readonly LedgerKind[] = [
  'rokar',
  'zamindar',
  'beopari',
  'thekedar',
  'pakka',
  'revenue',
  'government',
]

dashboard.openapi(
  createRoute({
    method: 'get',
    path: '/dashboard',
    responses: {
      200: {
        description: 'Dashboard snapshot: cash in hand, True Shop Value, the 7 ledgers, reconciliation',
        content: { 'application/json': { schema: dashboardResponse } },
      },
    },
  }),
  async (c) => {
    const repo = new Repository(c.env.DB)
    const stream = await repo.allEntries()

    const [zamindarAccounts, pakkaAccounts, thekedarAccounts, beopariAccounts] = await Promise.all([
      repo.accountsByKind('zamindar'),
      repo.accountsByKind('pakka'),
      repo.accountsByKind('thekedar'),
      repo.accountsByKind('beopari'),
    ])

    const farmerAccountIds = zamindarAccounts.map((a) => a.id)
    const buyerAccountIds = pakkaAccounts.map((a) => a.id)
    const thekedarAccountIds = thekedarAccounts.map((a) => a.id)
    const beopariAccountIds = beopariAccounts.map((a) => a.id)

    const inputs = {
      stream,
      buyerAccountIds,
      farmerAccountIds,
      thekedarAccountIds,
      // Not yet wired to persistence (#21 lending, #28 Beopari purchase) —
      // genuinely empty until those land, so these terms are correctly 0.
      godown: emptyGodown(),
      bardanaLoans: [],
    }

    const breakdown = trueShopValue(inputs)

    // Seed capital (ADR-0022): the shop's opening equity, established by the
    // one-time genesis entry (issue #19) — assets minus liabilities among
    // just the 'opening_balance'-kind postings (POST /genesis, or the older
    // single-account POST /rokar/opening). Folding this through the same
    // trueShopValue() balance-sheet math (rather than naively summing raw
    // signed amounts) is what makes it correct once genesis touches more
    // than one ledger kind at once: Rokar's positive balance is an asset,
    // but a positive farmer/thekedar balance is a *liability* — a plain sum
    // would conflate the two.
    const seedEntries = stream.filter((e) => e.kind === 'opening_balance')
    const seedCapital = trueShopValue({ ...inputs, stream: seedEntries }).total

    const reconciliation = reconcile(seedCapital, inputs)

    const idsByKind: Record<LedgerKind, readonly string[]> = {
      rokar: [ROKAR_ID],
      zamindar: farmerAccountIds,
      beopari: beopariAccountIds,
      thekedar: thekedarAccountIds,
      pakka: buyerAccountIds,
      revenue: [REVENUE_ID],
      government: [GOVERNMENT_ID],
    }

    const ledgers = LEDGER_KINDS.map((kind) => ({
      kind,
      balance: sumBalancesOf(stream, idsByKind[kind]),
    }))

    return c.json(
      {
        cashInHand: cashInHand(stream),
        trueShopValue: breakdown.total,
        breakdown,
        reconciliation,
        ledgers,
      },
      200,
    )
  },
)
