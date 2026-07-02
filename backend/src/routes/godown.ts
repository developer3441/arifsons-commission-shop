// Thin HTTP boundary (architecture.md): read the persisted Godown state →
// fold through the pure averageCostPerKg (domain/godown.ts, unchanged from
// round 1) → respond. Issue #28: the read side of the Godown/Mal Khata — bag
// count, net kg, and running average cost/kg. Receiving stock happens as a
// side effect of a house-buyer trade (routes/trades.ts). Issue #29 adds the
// other side: reselling stock to a real buyer at the running average cost,
// realising trading P&L (booked to revenue, itemised separately from
// commission — ADR-0005), guard-railed against over-resale (ADR-0019).

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository, GodownRepository } from '../db/repository'
import { averageCostPerKg, postStockResale, resellStock } from '../domain/godown'
import { pkr } from '../domain/money'
import { pakkaAccount } from '../domain/posting'
import { requireAuth, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const godown = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

godown.use('/godown', requireAuth)
godown.use('/godown/*', requireAuth)

godown.openapi(
  createRoute({
    method: 'get',
    path: '/godown',
    responses: {
      200: {
        description: 'The Godown running state: bags, net kg, total cost basis, and average cost/kg',
        content: {
          'application/json': {
            schema: z.object({
              bags: z.number().int(),
              netKg: z.number(),
              totalCostBasis: z.number().int(),
              averageCostPerKg: z.number(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const state = await new GodownRepository(c.env.DB).getState()
    return c.json({ ...state, averageCostPerKg: averageCostPerKg(state) }, 200)
  },
)

// --- sell Godown stock to a real buyer, realising trading P&L (issue #29) ---
godown.openapi(
  createRoute({
    method: 'post',
    path: '/godown/resale',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              entryId: z.string(),
              buyerId: z.string(),
              bagsSold: z.number().int().positive(),
              netKgSold: z.number().positive(),
              saleProceeds: z.number().int().positive(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Resale posted: buyer debited, Godown reduced, trading P&L booked to revenue',
        content: {
          'application/json': {
            schema: z.object({
              entryId: z.string(),
              buyerId: z.string(),
              costOfGoodsSold: z.number().int(),
              tradingPnL: z.number().int(),
              godown: z.object({ bags: z.number().int(), netKg: z.number(), totalCostBasis: z.number().int() }),
            }),
          },
        },
      },
      400: { description: 'Selling more stock (bags or net kg) than the Godown holds is rejected (ADR-0019)' },
    },
  }),
  async (c) => {
    const { entryId, buyerId, bagsSold, netKgSold, saleProceeds } = c.req.valid('json')
    const repo = new Repository(c.env.DB)
    const godownRepo = new GodownRepository(c.env.DB)

    // Compute against the pure domain function first (ADR-0019: reject at
    // the API boundary before any posting is written) — the guard against
    // over-resale lives in resellStock() itself (godown.ts, unchanged from
    // round 1).
    const current = await godownRepo.getState()
    let resale
    try {
      resale = resellStock(current, bagsSold, netKgSold, pkr(saleProceeds))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid resale' }, 400)
    }

    await repo.ensureAccount(pakkaAccount(buyerId))
    const entry = postStockResale(entryId, buyerId, pkr(saleProceeds), resale)
    await repo.recordEntry(entry, { actorUserId: c.get('userId') })
    // Same ordering as a house purchase (routes/trades.ts, issue #28): the
    // ledger entry is recorded first, the Godown aggregate updates after.
    await godownRepo.setState(resale.newState)

    return c.json(
      {
        entryId,
        buyerId,
        costOfGoodsSold: resale.costOfGoodsSold,
        tradingPnL: resale.tradingPnL,
        godown: resale.newState,
      },
      201,
    )
  },
)
