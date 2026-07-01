import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #1 walking skeleton, full stack: HTTP route → pure engine → D1 → read back.
// Proves the same path the deployed Worker runs, against a real (Miniflare) D1.
// Issue #15: every data route requires auth (ADR-0020) — authenticate first.

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
})

async function loginAsBookkeeper(): Promise<string> {
  await new UserRepository(env.DB).createUser('u-bk-1', 'Munshi', 'munshi', 'password123', 'bookkeeper')
  const res = await app.request('/auth/login', json({ username: 'munshi', password: 'password123' }), env)
  const { token } = (await res.json()) as { token: string }
  return token
}

describe('ledger API — end-to-end through D1', () => {
  it('a Peshi advance posts farmer -N and Rokar -N, readable back', async () => {
    const token = await loginAsBookkeeper()

    let res = await app.request('/accounts/farmers', json({ id: 'farmer-ali', name: 'Ali' }, token), env)
    expect(res.status).toBe(201)

    res = await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
    expect(res.status).toBe(201)

    res = await app.request(
      '/advances',
      json({ entryId: 'e1', farmerId: 'farmer-ali', amount: 200_000 }, token),
      env,
    )
    expect(res.status).toBe(201)

    res = await app.request('/accounts/farmer-ali/balance', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(await res.json()).toEqual({ accountId: 'farmer-ali', balance: -200_000 })

    res = await app.request('/accounts/rokar/balance', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(await res.json()).toEqual({ accountId: 'rokar', balance: 800_000 })
  })

  it('rejects an unauthenticated request to a data endpoint', async () => {
    const res = await app.request('/accounts/farmers', json({ id: 'farmer-no-auth' }), env)
    expect(res.status).toBe(401)
  })
})
