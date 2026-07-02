// Thin HTTP boundary (architecture.md): validate → guard (ADR-0019) → call the
// pure cash engine (cash.ts, unchanged from round 1) → persist → respond.
// Issue #27: the three Rokar-only "settle-up" actions — buyer payment,
// farmer withdrawal, contractor payout — plus the Rokar cash book (a
// projection, same pattern as the farmer statement, issue #26).

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository } from '../db/repository'
import { buyerPayment, farmerWithdrawal, contractorPayout } from '../domain/cash'
import { cashBook } from '../domain/dashboard'
import { assertSufficientCash, InsufficientCashError } from '../domain/guards'
import { pkr } from '../domain/money'
import { ROKAR_ID, pakkaAccount, zamindarAccount, thekedarAccount } from '../domain/posting'
import { requireAuth, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const cash = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

cash.use('/payments/*', requireAuth)
cash.use('/rokar/cashbook', requireAuth)

const money = z.number().int().openapi({ example: 50_000 })

// --- a buyer clears their Pakka tab in full: Rokar up, buyer -> 0 ---
cash.openapi(
  createRoute({
    method: 'post',
    path: '/payments/buyer',
    request: {
      body: {
        content: { 'application/json': { schema: z.object({ entryId: z.string(), buyerId: z.string() }) } },
      },
    },
    responses: {
      201: {
        description: 'Buyer payment posted',
        content: { 'application/json': { schema: z.object({ entryId: z.string(), buyerId: z.string(), amount: z.number().int() }) } },
      },
      400: { description: 'This buyer has no outstanding receivable to pay' },
    },
  }),
  async (c) => {
    const { entryId, buyerId } = c.req.valid('json')
    const repo = new Repository(c.env.DB)
    const buyer = pakkaAccount(buyerId)
    const currentBalance = await repo.balanceOf(buyerId)

    let entry
    try {
      entry = buyerPayment(entryId, buyer, currentBalance)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid buyer payment' }, 400)
    }

    await repo.ensureAccount(buyer)
    await repo.recordEntry(entry, { actorUserId: c.get('userId') })
    return c.json({ entryId, buyerId, amount: -currentBalance }, 201)
  },
)

// --- a farmer withdraws all or part of their held balance: Rokar down, balance reduced ---
cash.openapi(
  createRoute({
    method: 'post',
    path: '/payments/withdrawal',
    request: {
      body: {
        content: {
          'application/json': { schema: z.object({ entryId: z.string(), farmerId: z.string(), amount: money }) },
        },
      },
    },
    responses: {
      201: {
        description: 'Withdrawal posted',
        content: { 'application/json': { schema: z.object({ entryId: z.string(), farmerId: z.string(), amount: z.number().int() }) } },
      },
      400: { description: 'Invalid withdrawal (no held balance to cover it) or would drive Rokar negative (ADR-0019)' },
    },
  }),
  async (c) => {
    const { entryId, farmerId, amount } = c.req.valid('json')
    const repo = new Repository(c.env.DB)

    // ADR-0019: reject at the API boundary, before any posting is written.
    try {
      assertSufficientCash(await repo.balanceOf(ROKAR_ID), pkr(amount))
    } catch (err) {
      if (err instanceof InsufficientCashError) return c.json({ error: err.message }, 400)
      throw err
    }

    const farmer = zamindarAccount(farmerId)
    const currentBalance = await repo.balanceOf(farmerId)

    let entry
    try {
      entry = farmerWithdrawal(entryId, farmer, pkr(amount), currentBalance)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid withdrawal' }, 400)
    }

    await repo.ensureAccount(farmer)
    await repo.recordEntry(entry, { actorUserId: c.get('userId') })
    return c.json({ entryId, farmerId, amount }, 201)
  },
)

// --- a contractor collects wages in full: Rokar down, thekedar -> 0 ---
cash.openapi(
  createRoute({
    method: 'post',
    path: '/payments/payout',
    request: {
      body: {
        content: { 'application/json': { schema: z.object({ entryId: z.string(), thekedarId: z.string() }) } },
      },
    },
    responses: {
      201: {
        description: 'Contractor payout posted',
        content: { 'application/json': { schema: z.object({ entryId: z.string(), thekedarId: z.string(), amount: z.number().int() }) } },
      },
      400: { description: 'No outstanding wages to collect, or would drive Rokar negative (ADR-0019)' },
    },
  }),
  async (c) => {
    const { entryId, thekedarId } = c.req.valid('json')
    const repo = new Repository(c.env.DB)
    const thekedar = thekedarAccount(thekedarId)
    const currentBalance = await repo.balanceOf(thekedarId)

    // ADR-0019: reject at the API boundary, before any posting is written.
    if (currentBalance > 0) {
      try {
        assertSufficientCash(await repo.balanceOf(ROKAR_ID), currentBalance)
      } catch (err) {
        if (err instanceof InsufficientCashError) return c.json({ error: err.message }, 400)
        throw err
      }
    }

    let entry
    try {
      entry = contractorPayout(entryId, thekedar, currentBalance)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid payout' }, 400)
    }

    await repo.ensureAccount(thekedar)
    await repo.recordEntry(entry, { actorUserId: c.get('userId') })
    return c.json({ entryId, thekedarId, amount: -currentBalance }, 201)
  },
)

// --- the Rokar cash book: every entry that moved physical cash, running balance ---
const cashBookLineSchema = z.object({
  entryId: z.string(),
  kind: z.string(),
  amount: z.number().int(),
  balanceAfter: z.number().int(),
})

cash.openapi(
  createRoute({
    method: 'get',
    path: '/rokar/cashbook',
    responses: {
      200: {
        description: 'Cash in / cash out, with a running Rokar balance',
        content: {
          'application/json': {
            schema: z.object({ balance: z.number().int(), entries: z.array(cashBookLineSchema) }),
          },
        },
      },
    },
  }),
  async (c) => {
    const repo = new Repository(c.env.DB)
    const stream = await repo.allEntries()
    const entries = cashBook(stream)
    return c.json({ balance: await repo.balanceOf(ROKAR_ID), entries }, 200)
  },
)
