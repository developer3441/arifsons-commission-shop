// Users admin (ADR-0020): Owner-only create/list/deactivate. Farmers, buyers,
// and contractors are never users — this is shop-staff-only.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { UserRepository } from '../db/repository'
import { requireAuth, requireOwner, type AuthedBindings, type AuthedVariables } from './middleware'

export const users = new OpenAPIHono<{
  Bindings: AuthedBindings & { DB: D1Database }
  Variables: AuthedVariables
}>()

users.use('/users', requireAuth, requireOwner)
users.use('/users/*', requireAuth, requireOwner)

const roleSchema = z.enum(['owner', 'bookkeeper', 'viewer'])
const userResponse = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  role: roleSchema,
  active: z.boolean(),
})

users.openapi(
  createRoute({
    method: 'post',
    path: '/users',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              name: z.string(),
              username: z.string(),
              password: z.string(),
              role: roleSchema,
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'User created', content: { 'application/json': { schema: userResponse } } },
    },
  }),
  async (c) => {
    const { id, name, username, password, role } = c.req.valid('json')
    const repo = new UserRepository(c.env.DB)
    const created = await repo.createUser(id, name, username, password, role)
    return c.json(created, 201)
  },
)

users.openapi(
  createRoute({
    method: 'get',
    path: '/users',
    responses: {
      200: { description: 'All users', content: { 'application/json': { schema: z.array(userResponse) } } },
    },
  }),
  async (c) => {
    const repo = new UserRepository(c.env.DB)
    return c.json(await repo.listUsers(), 200)
  },
)

users.openapi(
  createRoute({
    method: 'patch',
    path: '/users/{id}/deactivate',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'User deactivated', content: { 'application/json': { schema: z.object({ id: z.string(), active: z.boolean() }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const repo = new UserRepository(c.env.DB)
    await repo.deactivateUser(id)
    return c.json({ id, active: false }, 200)
  },
)
