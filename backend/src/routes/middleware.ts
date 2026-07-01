// RBAC middleware (ADR-0020/0025): every data route requires a valid,
// unexpired bearer token; the sensitive set additionally requires the Owner
// role. Thin HTTP boundary — no business logic here.

import type { Context, Next } from 'hono'
import { verifyToken, type Role } from '../auth/tokens'

export type AuthedBindings = { AUTH_SECRET: string }
export type AuthedVariables = { userId: string; role: Role }

/** Reject unauthenticated requests; attach { userId, role } to the request context. */
export async function requireAuth(
  c: Context<{ Bindings: AuthedBindings; Variables: AuthedVariables }>,
  next: Next,
) {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
  if (!token) {
    return c.json({ error: 'Unauthorized: missing bearer token' }, 401)
  }
  const result = await verifyToken(token, c.env.AUTH_SECRET)
  if (!result.valid || !result.payload) {
    return c.json({ error: `Unauthorized: ${result.reason ?? 'invalid token'}` }, 401)
  }
  c.set('userId', result.payload.sub)
  c.set('role', result.payload.role)
  await next()
}

/** Reject non-Owner requests. Must run after requireAuth. */
export async function requireOwner(
  c: Context<{ Bindings: AuthedBindings; Variables: AuthedVariables }>,
  next: Next,
) {
  if (c.get('role') !== 'owner') {
    return c.json({ error: 'Forbidden: Owner role required' }, 403)
  }
  await next()
}
