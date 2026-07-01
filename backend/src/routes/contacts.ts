// Thin HTTP boundary (architecture.md): validate → persist via the repository
// → respond. No business logic lives here — per-customer override precedence
// is resolved entirely in the domain layer (trade.ts) when a trade is posted.
//
// Issue #17: Contacts (farmers/buyers/contractors) as customer accounts
// (ADR-0007), each optionally carrying per-customer commission and
// cost-bearer/Katt overrides (ADR-0001/0003/0012).

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository } from '../db/repository'
import { type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const contacts = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

const kindSchema = z.enum(['zamindar', 'pakka', 'thekedar'])
const bearerSchema = z.enum(['farmer', 'buyer'])

const contactSchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string().optional(),
  commissionRate: z.number().optional(),
  buyerCommissionRate: z.number().optional(),
  bagBearer: z.string().optional(),
  labourBearer: z.string().optional(),
  kattKgPerBag: z.number().optional(),
  balance: z.number().int(),
})

// --- create or edit a contact (farmer, buyer, or contractor) ---
contacts.openapi(
  createRoute({
    method: 'post',
    path: '/contacts',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              kind: kindSchema,
              name: z.string().optional(),
              commissionRate: z.number().optional(),
              buyerCommissionRate: z.number().optional(),
              bagBearer: bearerSchema.optional(),
              labourBearer: bearerSchema.optional(),
              kattKgPerBag: z.number().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Contact created or updated',
        content: { 'application/json': { schema: contactSchema } },
      },
    },
  }),
  async (c) => {
    const input = c.req.valid('json')
    const repo = new Repository(c.env.DB)
    await repo.upsertContact(input)
    const contact = await repo.getContact(input.id)
    return c.json(contact!, 201)
  },
)

// --- search contacts of one kind (Contacts screen list) ---
contacts.openapi(
  createRoute({
    method: 'get',
    path: '/contacts',
    request: { query: z.object({ kind: kindSchema, q: z.string().optional() }) },
    responses: {
      200: {
        description: 'Matching contacts',
        content: { 'application/json': { schema: z.array(contactSchema) } },
      },
    },
  }),
  async (c) => {
    const { kind, q } = c.req.valid('query')
    const results = await new Repository(c.env.DB).listContacts(kind, q)
    return c.json(results, 200)
  },
)

// --- read one contact, with its running balance ---
contacts.openapi(
  createRoute({
    method: 'get',
    path: '/contacts/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: 'The contact, with its running balance',
        content: { 'application/json': { schema: contactSchema } },
      },
      404: { description: 'No such contact' },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const contact = await new Repository(c.env.DB).getContact(id)
    if (!contact) return c.json({ error: 'Not found' }, 404)
    return c.json(contact, 200)
  },
)
