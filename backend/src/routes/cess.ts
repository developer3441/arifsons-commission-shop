// Thin HTTP boundary (architecture.md): read the government ledger balance →
// call the pure cash engine (cash.ts's remitCess(), unchanged from round 1)
// → persist → respond. Issue #25.
//
// Cess accrual itself needs no new code here: trade.ts already posts cess to
// the Government ledger (never revenue) on every sale with a nonzero
// cessRate (ADR-0004) — see routes/trades.ts, which already ensures the
// government account exists. This route is the remittance half: Owner-only
// (ADR-0020), and guarded like every other cash-out (ADR-0019) — it can't
// drive Rokar negative, and there's nothing to reject-as-an-"over-remit"
// distinctly from that same guard, since a remittance always pays out
// exactly the held balance, never more.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository } from '../db/repository'
import { assertSufficientCash, InsufficientCashError } from '../domain/guards'
import { remitCess } from '../domain/cash'
import { ROKAR_ID, GOVERNMENT_ID, governmentAccount } from '../domain/posting'
import { requireAuth, requireOwner, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const cess = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

cess.use('/cess', requireAuth)
cess.use('/cess/*', requireAuth)

// --- cess currently held (the liability) ---
cess.openapi(
  createRoute({
    method: 'get',
    path: '/cess',
    responses: {
      200: {
        description: 'Cess held for the government',
        content: { 'application/json': { schema: z.object({ held: z.number().int() }) } },
      },
    },
  }),
  async (c) => {
    const held = await new Repository(c.env.DB).balanceOf(GOVERNMENT_ID)
    return c.json({ held }, 200)
  },
)

// --- remit the full held cess to the government (Owner-only) ---
cess.openapi(
  createRoute({
    method: 'post',
    path: '/cess/remit',
    request: { body: { content: { 'application/json': { schema: z.object({ entryId: z.string() }) } } } },
    responses: {
      201: {
        description: 'Cess remitted',
        content: { 'application/json': { schema: z.object({ entryId: z.string(), amountRemitted: z.number().int() }) } },
      },
      400: { description: 'Nothing held to remit, or remitting would drive Rokar negative' },
      403: { description: 'Only an Owner may remit cess' },
    },
  }),
  async (c) => {
    if (c.get('role') !== 'owner') {
      return c.json({ error: 'Forbidden: Owner role required' }, 403)
    }

    const { entryId } = c.req.valid('json')
    const repo = new Repository(c.env.DB)
    const held = await repo.balanceOf(GOVERNMENT_ID)

    if (held <= 0) {
      return c.json({ error: 'No cess is held to remit' }, 400)
    }

    try {
      assertSufficientCash(await repo.balanceOf(ROKAR_ID), held)
    } catch (err) {
      if (err instanceof InsufficientCashError) {
        return c.json({ error: err.message }, 400)
      }
      throw err
    }

    const entry = remitCess(entryId, governmentAccount(), held)
    await repo.recordEntry(entry, { actorUserId: c.get('userId') })

    return c.json({ entryId, amountRemitted: held }, 201)
  },
)
