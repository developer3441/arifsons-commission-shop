// Thin HTTP boundary (architecture.md): read the persisted Godown state →
// fold through the pure averageCostPerKg (domain/godown.ts, unchanged from
// round 1) → respond. Issue #28: the read side of the Godown/Mal Khata — bag
// count, net kg, and running average cost/kg. Receiving stock happens as a
// side effect of a house-buyer trade (routes/trades.ts); resale is #29.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { GodownRepository } from '../db/repository'
import { averageCostPerKg } from '../domain/godown'
import { requireAuth, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const godown = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

godown.use('/godown', requireAuth)

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
