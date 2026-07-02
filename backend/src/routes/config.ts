// Thin HTTP boundary (architecture.md): validate → persist via the repository
// → respond. Global shop defaults (issue #18) that seed the trade engine's
// TradeConfig — reading is open to any authenticated shop-staff role, but
// only an Owner may change them (ADR-0020), checked inline rather than via a
// path-scoped middleware so GET and PUT on the same path can differ.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { ConfigRepository } from '../db/repository'
import { requireAuth, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const config = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

config.use('/config', requireAuth)

const bearerSchema = z.enum(['farmer', 'buyer'])

const configSchema = z.object({
  farmerCommissionRate: z.number(),
  buyerCommissionRate: z.number(),
  kattKgPerBag: z.number(),
  perBagLabour: z.number(),
  perBagCharge: z.number(),
  bagBearer: bearerSchema,
  labourBearer: bearerSchema,
  cessRate: z.number(),
})

config.openapi(
  createRoute({
    method: 'get',
    path: '/config',
    responses: {
      200: { description: 'Current shop defaults', content: { 'application/json': { schema: configSchema } } },
    },
  }),
  async (c) => {
    const current = await new ConfigRepository(c.env.DB).getConfig()
    return c.json(current, 200)
  },
)

config.openapi(
  createRoute({
    method: 'put',
    path: '/config',
    request: {
      body: { content: { 'application/json': { schema: configSchema.partial() } } },
    },
    responses: {
      200: { description: 'Updated shop defaults', content: { 'application/json': { schema: configSchema } } },
      403: { description: 'Only an Owner may change shop defaults' },
    },
  }),
  async (c) => {
    if (c.get('role') !== 'owner') {
      return c.json({ error: 'Forbidden: Owner role required' }, 403)
    }
    const update = c.req.valid('json')
    const updated = await new ConfigRepository(c.env.DB).setConfig(update)
    return c.json(updated, 200)
  },
)
