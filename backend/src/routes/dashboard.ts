// Thin HTTP boundary (architecture.md): assemble the persisted posting stream
// and account register, fold it through the pure domain layer (dashboard.ts),
// respond. No business logic lives here — cashInHand/trueShopValue/reconcile
// are the same pure functions the domain tests exercise in-memory.
//
// Issue #16. Godown state is now real (#28) — a house-buyer trade
// (routes/trades.ts) folds stock into it, and this route reads it back.
// Bardana's own True Shop Value term is deliberately always zero — see the
// comment below on farmerReceivables/bardanaLoans for why.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository, GodownRepository } from '../db/repository'
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

    const [zamindarAccounts, pakkaAccounts, thekedarAccounts, beopariAccounts, godownState] = await Promise.all([
      repo.accountsByKind('zamindar'),
      repo.accountsByKind('pakka'),
      repo.accountsByKind('thekedar'),
      repo.accountsByKind('beopari'),
      new GodownRepository(c.env.DB).getState(),
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
      // The Godown's real running state (issue #28) — updated as a side
      // effect of each house-buyer trade (routes/trades.ts).
      godown: godownState,
      // Deliberately always empty, even now that bardana lending is
      // persisted (#21): domain/bardana.ts's lendBardana() already posts a
      // debit to the farmer's own ledger (verified essential to how a later
      // trade sale settles the loan — see test/domain/bardana.test.ts's
      // farmer-/buyer-borne cases), which farmerReceivables above already
      // counts as an asset. Also passing the same outstanding loan here
      // would double it. One consequence worth knowing: while a bardana loan
      // is outstanding, True Shop Value is correctly higher by its value,
      // and the reconciliation invariant below shows that as non-zero drift
      // until the loan is returned or resolved via a sale — expected
      // behaviour of round 1's bardana model, not a bug.
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
    //
    // Bug fixed alongside issue #28: this must use an *empty* godown and no
    // bardana loans, not `...inputs`'s real (possibly non-zero) current
    // state — genesis never touches either, so folding today's Godown value
    // in here inflated "seed capital" by whatever stock happens to be on
    // hand right now, which drove the reconciliation invariant permanently
    // off by exactly that amount. Harmless while Godown was always
    // emptyGodown() (pre-#28); surfaced the moment it carried real data.
    const seedEntries = stream.filter((e) => e.kind === 'opening_balance')
    const seedCapital = trueShopValue({
      stream: seedEntries,
      buyerAccountIds,
      farmerAccountIds,
      thekedarAccountIds,
      godown: emptyGodown(),
      bardanaLoans: [],
    }).total

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
