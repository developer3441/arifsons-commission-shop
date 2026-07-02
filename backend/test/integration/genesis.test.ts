import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #19 — Genesis: one-time opening-balance import (ADR-0022). End-to-end:
// HTTP route -> pure domain (genesis.ts) -> D1 -> Dashboard reads it back and
// reconciles to zero drift.

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
})

async function login(id: string, role: 'owner' | 'bookkeeper'): Promise<string> {
  await new UserRepository(env.DB).createUser(id, 'Staff', `staff-${id}`, 'password123', role)
  const res = await app.request('/auth/login', json({ username: `staff-${id}`, password: 'password123' }), env)
  const { token } = (await res.json()) as { token: string }
  return token
}

describe('POST /genesis', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/genesis', json({ rokarOpening: 100 }), env)
    expect(res.status).toBe(401)
  })

  it('rejects a non-Owner', async () => {
    const token = await login('gen-1', 'bookkeeper')
    const res = await app.request('/genesis', json({ rokarOpening: 100_000 }, token), env)
    expect(res.status).toBe(403)
  })

  it(
    'an Owner imports opening balances; the Dashboard reflects them and reconciles to zero drift; ' +
      'a second genesis attempt is rejected (one-time — correct mistakes with an adjusting entry instead)',
    async () => {
      // Genesis is a database-wide singleton (fixed entry id 'genesis') by design
      // (ADR-0022) — so this one test owns the only successful POST /genesis in
      // this file, and also proves the one-time guard against a second attempt.
      const token = await login('gen-2', 'owner')

      const post = await app.request(
        '/genesis',
        json(
          {
            rokarOpening: 1_000_000,
            farmerBalances: [{ id: 'farmer-genesis-1', name: 'Old Farmer', balance: -50_000 }],
            buyerBalances: [{ id: 'buyer-genesis-1', name: 'Old Buyer', balance: -30_000 }],
            contractorBalances: [{ id: 'thekedar-genesis-1', name: 'Old Contractor', balance: 10_000 }],
          },
          token,
        ),
        env,
      )
      expect(post.status).toBe(201)
      const body = (await post.json()) as { id: string; postings: number }
      expect(body.id).toBe('genesis')
      expect(body.postings).toBe(4)

      const dash = await app.request('/dashboard', { headers: { authorization: `Bearer ${token}` } }, env)
      const snapshot = (await dash.json()) as {
        cashInHand: number
        trueShopValue: number
        reconciliation: { drift: number; reconciles: boolean }
      }
      expect(snapshot.cashInHand).toBe(1_000_000)
      // opening equity = 1,000,000 (cash) + 50,000 (farmer receivable) + 30,000 (buyer receivable) − 10,000 (labour owed)
      expect(snapshot.trueShopValue).toBe(1_070_000)
      expect(snapshot.reconciliation.drift).toBe(0)
      expect(snapshot.reconciliation.reconciles).toBe(true)

      const second = await app.request('/genesis', json({ rokarOpening: 500_000 }, token), env)
      expect(second.status).toBe(409)
    },
  )

  it('rejects an import with nothing in it', async () => {
    const token = await login('gen-4', 'owner')
    const res = await app.request('/genesis', json({}, token), env)
    expect(res.status).toBe(400)
  })
})
