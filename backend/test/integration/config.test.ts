import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #18 — global shop defaults (ADR-0001/0003/0004/0012): any
// authenticated user can read them, only an Owner can change them.

const json = (body: unknown, token?: string, method = 'PUT') => ({
  method,
  body: JSON.stringify(body),
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
})

async function login(id: string, role: 'owner' | 'bookkeeper'): Promise<string> {
  await new UserRepository(env.DB).createUser(id, 'Staff', `staff-${id}`, 'password123', role)
  const res = await app.request('/auth/login', json({ username: `staff-${id}`, password: 'password123' }, undefined, 'POST'), env)
  const { token } = (await res.json()) as { token: string }
  return token
}

describe('GET/PUT /config', () => {
  it('rejects an unauthenticated read', async () => {
    const res = await app.request('/config', {}, env)
    expect(res.status).toBe(401)
  })

  it('returns built-in defaults before anything is saved', async () => {
    const token = await login('cfg-1', 'bookkeeper')
    const res = await app.request('/config', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(res.status).toBe(200)
    const cfg = (await res.json()) as { farmerCommissionRate: number; kattKgPerBag: number }
    expect(cfg.farmerCommissionRate).toBe(0.02)
    expect(cfg.kattKgPerBag).toBe(1.5)
  })

  it('rejects a non-Owner trying to change config', async () => {
    const token = await login('cfg-2', 'bookkeeper')
    const res = await app.request('/config', json({ farmerCommissionRate: 0.05 }, token), env)
    expect(res.status).toBe(403)
  })

  it('an Owner can set config, and the read-back reflects it', async () => {
    const token = await login('cfg-3', 'owner')
    const put = await app.request(
      '/config',
      json({ farmerCommissionRate: 0.04, cessRate: 0.01, bagBearer: 'buyer' }, token),
      env,
    )
    expect(put.status).toBe(200)

    const read = await app.request('/config', { headers: { authorization: `Bearer ${token}` } }, env)
    const cfg = (await read.json()) as {
      farmerCommissionRate: number
      cessRate: number
      bagBearer: string
      buyerCommissionRate: number
    }
    expect(cfg.farmerCommissionRate).toBe(0.04)
    expect(cfg.cessRate).toBe(0.01)
    expect(cfg.bagBearer).toBe('buyer')
    // untouched fields keep their previous/default value
    expect(cfg.buyerCommissionRate).toBe(0)
  })
})
