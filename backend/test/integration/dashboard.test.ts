import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #16 — the Dashboard route: assembles the persisted posting stream
// through the pure domain layer (dashboard.ts) and returns the two hero
// pillars, all 7 ledgers, and the reconciliation indicator.

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
})

async function loginAsBookkeeper(id: string): Promise<string> {
  await new UserRepository(env.DB).createUser(id, 'Munshi', `munshi-${id}`, 'password123', 'bookkeeper')
  const res = await app.request(
    '/auth/login',
    json({ username: `munshi-${id}`, password: 'password123' }),
    env,
  )
  const { token } = (await res.json()) as { token: string }
  return token
}

describe('GET /dashboard', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/dashboard', {}, env)
    expect(res.status).toBe(401)
  })

  it('reconciles at zero drift after opening cash and a Peshi advance', async () => {
    const token = await loginAsBookkeeper('dash-1')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    await app.request('/accounts/farmers', json({ id: 'farmer-dash-1', name: 'Ali' }, token), env)
    await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
    await app.request(
      '/advances',
      json({ entryId: 'e-dash-1', farmerId: 'farmer-dash-1', amount: 200_000 }, token),
      env,
    )

    const res = await app.request('/dashboard', auth, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      cashInHand: number
      trueShopValue: number
      reconciliation: { drift: number; reconciles: boolean }
      ledgers: { kind: string; balance: number }[]
    }

    // Cash in Hand: 1,000,000 opening − 200,000 advance
    expect(body.cashInHand).toBe(800_000)
    // True Shop Value: 800,000 cash + 200,000 farmer receivable (unrepaid advance)
    expect(body.trueShopValue).toBe(1_000_000)
    // Seed capital (opening_balance entries) = 1,000,000; retained profit = 0 → reconciles.
    expect(body.reconciliation.drift).toBe(0)
    expect(body.reconciliation.reconciles).toBe(true)

    const rokar = body.ledgers.find((l) => l.kind === 'rokar')
    expect(rokar?.balance).toBe(800_000)
    const zamindar = body.ledgers.find((l) => l.kind === 'zamindar')
    expect(zamindar?.balance).toBe(-200_000)
    expect(body.ledgers.map((l) => l.kind)).toEqual([
      'rokar',
      'zamindar',
      'beopari',
      'thekedar',
      'pakka',
      'revenue',
      'government',
    ])
  })
})
