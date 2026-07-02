// Thin HTTP boundary (architecture.md): validate → persist via the
// repository → fold the pure weight pipeline (weight.ts, ADR-0002/0003) over
// the persisted bags → respond. Issue #22 — lot registration and weighing,
// the front half of the New Trade flow (issue #23 is the back half: picking
// a buyer, a rate, and generating the Kacha bill / Pakka invoice).
//
// Payable maunds shown here use the Katt that will actually apply if the lot
// were sold with no per-invoice override: the farmer's per-customer override
// (Contacts, issue #17) if set, else the shop's global default (Config,
// issue #18) — the same "per-customer > global" precedence trade.ts's
// resolve() uses, just previewed before a sale exists.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { LotRepository, Repository, ConfigRepository } from '../db/repository'
import { payableKg, payableMaunds, type Bag } from '../domain/weight'
import { zamindarAccount } from '../domain/posting'
import { requireAuth, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const lots = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

lots.use('/lots', requireAuth)
lots.use('/lots/*', requireAuth)

const bagView = z.object({ grossKg: z.number(), payableKg: z.number() })

const lotView = z.object({
  lotNumber: z.number().int(),
  farmerId: z.string(),
  businessDate: z.string(),
  bags: z.array(bagView),
  kattKgPerBag: z.number(),
  payableMaunds: z.number(),
})

const lotSummary = z.object({ lotNumber: z.number().int(), farmerId: z.string(), businessDate: z.string() })

/** Resolve the Katt that currently applies to this farmer: per-customer override, else the shop default. */
async function resolveKatt(env: Bindings, farmerId: string): Promise<number> {
  const [contact, config] = await Promise.all([
    new Repository(env.DB).getContact(farmerId),
    new ConfigRepository(env.DB).getConfig(),
  ])
  return contact?.kattKgPerBag ?? config.kattKgPerBag
}

async function buildLotView(env: Bindings, lotNumber: number) {
  const lot = await new LotRepository(env.DB).getLot(lotNumber)
  if (!lot) return undefined
  const katt = await resolveKatt(env, lot.farmerId)
  const bags: Bag[] = lot.bags.map((b) => ({ grossKg: b.grossKg }))
  return {
    lotNumber: lot.lotNumber,
    farmerId: lot.farmerId,
    businessDate: lot.businessDate,
    bags: lot.bags.map((b) => ({ grossKg: b.grossKg, payableKg: payableKg(b, katt) })),
    kattKgPerBag: katt,
    payableMaunds: payableMaunds(bags, katt),
  }
}

// --- register a new lot against a farmer ---
lots.openapi(
  createRoute({
    method: 'post',
    path: '/lots',
    request: {
      body: {
        content: {
          'application/json': { schema: z.object({ farmerId: z.string(), businessDate: z.string().optional() }) },
        },
      },
    },
    responses: {
      201: { description: 'Lot registered', content: { 'application/json': { schema: lotSummary } } },
    },
  }),
  async (c) => {
    const { farmerId, businessDate } = c.req.valid('json')
    const repo = new Repository(c.env.DB)
    await repo.ensureAccount(zamindarAccount(farmerId))
    const lot = await new LotRepository(c.env.DB).createLot(farmerId, businessDate)
    return c.json(lot, 201)
  },
)

// --- weigh one bag into a lot ---
lots.openapi(
  createRoute({
    method: 'post',
    path: '/lots/{lotNumber}/bags',
    request: {
      params: z.object({ lotNumber: z.coerce.number().int() }),
      body: { content: { 'application/json': { schema: z.object({ grossKg: z.number().positive() }) } } },
    },
    responses: {
      201: { description: 'Bag weighed', content: { 'application/json': { schema: lotView } } },
      404: { description: 'No such lot' },
    },
  }),
  async (c) => {
    const { lotNumber } = c.req.valid('param')
    const { grossKg } = c.req.valid('json')
    const lotRepo = new LotRepository(c.env.DB)

    const existing = await lotRepo.getLot(lotNumber)
    if (!existing) return c.json({ error: 'No such lot' }, 404)

    await lotRepo.addBag(lotNumber, grossKg)
    const view = await buildLotView(c.env, lotNumber)
    return c.json(view!, 201)
  },
)

// --- read a lot: every bag weighed so far, and the running payable maunds ---
lots.openapi(
  createRoute({
    method: 'get',
    path: '/lots/{lotNumber}',
    request: { params: z.object({ lotNumber: z.coerce.number().int() }) },
    responses: {
      200: { description: 'The lot', content: { 'application/json': { schema: lotView } } },
      404: { description: 'No such lot' },
    },
  }),
  async (c) => {
    const { lotNumber } = c.req.valid('param')
    const view = await buildLotView(c.env, lotNumber)
    if (!view) return c.json({ error: 'No such lot' }, 404)
    return c.json(view, 200)
  },
)

// --- list lots, optionally for one farmer (newest first) ---
lots.openapi(
  createRoute({
    method: 'get',
    path: '/lots',
    request: { query: z.object({ farmerId: z.string().optional() }) },
    responses: {
      200: { description: 'Lots', content: { 'application/json': { schema: z.array(lotSummary) } } },
    },
  }),
  async (c) => {
    const { farmerId } = c.req.valid('query')
    const list = await new LotRepository(c.env.DB).listLots(farmerId)
    return c.json(list, 200)
  },
)
