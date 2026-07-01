// Login (ADR-0025): verify username/password, issue a signed bearer token.
// Thin HTTP boundary — hashing/signing logic lives in src/auth/.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { UserRepository } from '../db/repository'
import { verifyPassword } from '../auth/password'
import { issueToken } from '../auth/tokens'
import type { AuthedBindings } from './middleware'

export const auth = new OpenAPIHono<{ Bindings: AuthedBindings & { DB: D1Database } }>()

auth.openapi(
  createRoute({
    method: 'post',
    path: '/auth/login',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ username: z.string(), password: z.string() }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Authenticated',
        content: {
          'application/json': {
            schema: z.object({
              token: z.string(),
              user: z.object({ id: z.string(), name: z.string(), role: z.string() }),
            }),
          },
        },
      },
      401: {
        description: 'Invalid credentials',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const { username, password } = c.req.valid('json')
    const users = new UserRepository(c.env.DB)
    const user = await users.findByUsername(username)

    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ error: 'Invalid username or password' }, 401)
    }

    const token = await issueToken(user.id, user.role, c.env.AUTH_SECRET)
    return c.json({ token, user: { id: user.id, name: user.name, role: user.role } }, 200)
  },
)
