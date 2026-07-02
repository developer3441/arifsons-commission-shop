// Thin HTTP boundary (architecture.md): validate → call the pure engine → persist
// via the repository → respond. No business logic lives here.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository } from '../db/repository'
import { pkr } from '../domain/money'
import { assertSufficientCash, InsufficientCashError } from '../domain/guards'
import {
  ROKAR_ID,
  issuePeshiAdvance,
  openingBalance,
  rokarAccount,
  zamindarAccount,
} from '../domain/posting'

import { type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & {
  DB: D1Database
  /** Comma-separated exact origins allowed to call the API cross-origin (ADR-0026). Empty/unset = same-origin only. */
  CORS_ORIGINS?: string
}

// Every data endpoint requires authentication (ADR-0020, wired per-path in
// index.ts rather than a blanket '*' here — a wildcard middleware on a
// sub-router leaks across every other router mounted onto the same parent
// app once merged, which would also gate /auth/login and /users).
export const ledger = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

const money = z.number().int().openapi({ example: 200_000 }) // whole PKR (ADR-0009)

const balanceResponse = z.object({ accountId: z.string(), balance: z.number().int() })

// --- create a farmer (Zamindar) account ---
ledger.openapi(
  createRoute({
    method: 'post',
    path: '/accounts/farmers',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ id: z.string(), name: z.string().optional() }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Farmer account created',
        content: { 'application/json': { schema: z.object({ id: z.string(), kind: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const { id, name } = c.req.valid('json')
    const account = zamindarAccount(id, name)
    await new Repository(c.env.DB).ensureAccount(account)
    return c.json({ id: account.id, kind: account.kind }, 201)
  },
)

// --- set the opening Rokar cash balance ---
ledger.openapi(
  createRoute({
    method: 'post',
    path: '/rokar/opening',
    request: {
      body: { content: { 'application/json': { schema: z.object({ amount: money }) } } },
    },
    responses: {
      201: {
        description: 'Opening cash recorded',
        content: { 'application/json': { schema: balanceResponse } },
      },
    },
  }),
  async (c) => {
    const { amount } = c.req.valid('json')
    const repo = new Repository(c.env.DB)
    const rokar = rokarAccount()
    await repo.ensureAccount(rokar)
    await repo.recordEntry(openingBalance('opening-rokar', rokar, pkr(amount)), { actorUserId: c.get('userId') })
    return c.json({ accountId: ROKAR_ID, balance: await repo.balanceOf(ROKAR_ID) }, 201)
  },
)

// --- issue an interest-free Peshi advance to a farmer ---
ledger.openapi(
  createRoute({
    method: 'post',
    path: '/advances',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ entryId: z.string(), farmerId: z.string(), amount: money }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Advance posted',
        content: {
          'application/json': {
            schema: z.object({ entryId: z.string(), farmerId: z.string(), amount: z.number().int() }),
          },
        },
      },
      400: { description: 'Advance would drive Rokar cash negative (ADR-0019)' },
    },
  }),
  async (c) => {
    const { entryId, farmerId, amount } = c.req.valid('json')
    const repo = new Repository(c.env.DB)

    // ADR-0019: reject at the API boundary, before any posting is written —
    // Rokar can never go negative.
    try {
      assertSufficientCash(await repo.balanceOf(ROKAR_ID), pkr(amount))
    } catch (err) {
      if (err instanceof InsufficientCashError) {
        return c.json({ error: err.message }, 400)
      }
      throw err
    }

    // Auto-register the farmer if this is their first touch (e.g. issuing an
    // advance to a new farmer straight from the quick action, before they've
    // been added as a Contact) — ensureAccount is idempotent either way.
    const farmer = zamindarAccount(farmerId)
    await repo.ensureAccount(farmer)

    const entry = issuePeshiAdvance(entryId, farmer, pkr(amount))
    await repo.recordEntry(entry, { actorUserId: c.get('userId') })
    return c.json({ entryId, farmerId, amount }, 201)
  },
)

// --- read any ledger balance (a projection of the posting stream) ---
ledger.openapi(
  createRoute({
    method: 'get',
    path: '/accounts/{id}/balance',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: 'Current balance',
        content: { 'application/json': { schema: balanceResponse } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const balance = await new Repository(c.env.DB).balanceOf(id)
    return c.json({ accountId: id, balance }, 200)
  },
)
