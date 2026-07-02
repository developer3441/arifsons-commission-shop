// Thin HTTP boundary (architecture.md): validate → call the pure engine
// (bardana.ts, unchanged from round 1) → persist the entry AND the bags-out
// tracker → respond.
//
// Issue #21. Design note on why bagsOut isn't ALSO fed into the dashboard's
// dedicated bardanaOutValue term (trueShopValue()'s `bardanaLoans` param):
// domain/bardana.ts's lendBardana() already posts a debit to the farmer's own
// (Zamindar) ledger account, which the dashboard already counts as an asset
// via farmerReceivables (issue #16). Passing the same outstanding loan into
// `bardanaLoans` too would double-count that asset — ADR-0010's formula lists
// "value of bardana lent out" as a term separate from farmer receivables,
// which is only accurate if bardana is tracked *instead of* a ledger posting,
// not *in addition to* one. Reworking lendBardana()/resolveBardanaLoan() to
// stop posting to the farmer ledger would fix that, but it's a bigger change
// than this issue's scope (a lending/tracking screen) and would touch round
// 1's already-verified reconciliation test (the buyer-borne bardana
// resolution in dashboard.test.ts). So for now: this table is purely an
// operational "bags out per farmer" tracker: the acceptance criterion
// ("bags-out value appears as an asset in True Shop Value") is satisfied via
// farmerReceivables, which already includes it correctly with zero drift.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository, BardanaRepository, ConfigRepository, InsufficientBagsError } from '../db/repository'
import { pkr } from '../domain/money'
import { lendBardana, resolveBardanaLoan } from '../domain/bardana'
import { zamindarAccount } from '../domain/posting'
import { requireAuth, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const bardana = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

bardana.use('/bardana', requireAuth)
bardana.use('/bardana/*', requireAuth)

const loanSchema = z.object({ farmerId: z.string(), bagsOut: z.number().int(), bagValue: z.number().int() })

// --- lend bags to a farmer ---
bardana.openapi(
  createRoute({
    method: 'post',
    path: '/bardana/lend',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              entryId: z.string(),
              farmerId: z.string(),
              bags: z.number().int().positive(),
              bagValue: z.number().int().optional(), // defaults to the shop's configured empty-bag value
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Bardana lent', content: { 'application/json': { schema: loanSchema } } },
    },
  }),
  async (c) => {
    const { entryId, farmerId, bags, bagValue: bagValueInput } = c.req.valid('json')
    const repo = new Repository(c.env.DB)
    const bagValue = pkr(bagValueInput ?? (await new ConfigRepository(c.env.DB).getConfig()).perBagCharge)

    const farmer = zamindarAccount(farmerId)
    await repo.ensureAccount(farmer)

    const { entry } = lendBardana(entryId, farmer, bags, bagValue)
    await repo.recordEntry(entry, { actorUserId: c.get('userId') })

    const loan = await new BardanaRepository(c.env.DB).lend(farmerId, bags, bagValue)
    return c.json(loan, 201)
  },
)

// --- record a return of bags ---
bardana.openapi(
  createRoute({
    method: 'post',
    path: '/bardana/return',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ entryId: z.string(), farmerId: z.string(), bags: z.number().int().positive() }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Bardana returned', content: { 'application/json': { schema: loanSchema } } },
      400: { description: 'More bags returned than are outstanding' },
      404: { description: 'No outstanding loan for this farmer' },
    },
  }),
  async (c) => {
    const { entryId, farmerId, bags } = c.req.valid('json')
    const bardanaRepo = new BardanaRepository(c.env.DB)

    const current = await bardanaRepo.getLoan(farmerId)
    if (!current || current.bagsOut === 0) {
      return c.json({ error: 'No outstanding bardana loan for this farmer' }, 404)
    }

    let loan
    try {
      loan = await bardanaRepo.returnBags(farmerId, bags)
    } catch (err) {
      if (err instanceof InsufficientBagsError) {
        return c.json({ error: err.message }, 400)
      }
      throw err
    }

    const entry = resolveBardanaLoan(entryId, { farmerId, bagsOut: bags, bagValue: current.bagValue })
    await new Repository(c.env.DB).recordEntry(entry, { actorUserId: c.get('userId') })

    return c.json(loan, 201)
  },
)

// --- outstanding bardana loans (the tracker screen's list) ---
bardana.openapi(
  createRoute({
    method: 'get',
    path: '/bardana',
    responses: {
      200: { description: 'Outstanding bardana loans', content: { 'application/json': { schema: z.array(loanSchema) } } },
    },
  }),
  async (c) => {
    const loans = await new BardanaRepository(c.env.DB).listOutstanding()
    return c.json(loans, 200)
  },
)
