// Thin HTTP boundary (architecture.md): validate → call the pure engine → persist
// via the repository → respond. No business logic lives here.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository } from '../db/repository'
import { pkr } from '../domain/money'
import {
  ROKAR_ID,
  issuePeshiAdvance,
  openingBalance,
  rokarAccount,
  zamindarAccount,
} from '../domain/posting'

export type Bindings = { DB: D1Database }

export const ledger = new OpenAPIHono<{ Bindings: Bindings }>()

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
    await repo.recordEntry(openingBalance('opening-rokar', rokar, pkr(amount)))
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
    },
  }),
  async (c) => {
    const { entryId, farmerId, amount } = c.req.valid('json')
    const entry = issuePeshiAdvance(entryId, zamindarAccount(farmerId), pkr(amount))
    await new Repository(c.env.DB).recordEntry(entry)
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
