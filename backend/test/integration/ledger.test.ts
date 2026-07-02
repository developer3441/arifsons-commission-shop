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

async function loginAsBookkeeper(id = 'u-bk-1'): Promise<string> {
  await new UserRepository(env.DB).createUser(id, 'Munshi', `munshi-${id}`, 'password123', 'bookkeeper')
  const res = await app.request('/auth/login', json({ username: `munshi-${id}`, password: 'password123' }), env)
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

  it('rejects a Peshi advance that would drive Rokar cash negative (ADR-0019, issue #20)', async () => {
    const token = await loginAsBookkeeper('u-bk-guard')

    let res = await app.request('/accounts/farmers', json({ id: 'farmer-guard' }, token), env)
    expect(res.status).toBe(201)

    // Whatever Rokar's running balance is from earlier tests in this file, an
    // advance this large is guaranteed to exceed it.
    res = await app.request(
      '/advances',
      json({ entryId: 'e-guard-1', farmerId: 'farmer-guard', amount: 999_999_999 }, token),
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/insufficient cash/i)

    // Atomic: nothing was posted — the farmer's balance stayed at zero.
    res = await app.request('/accounts/farmer-guard/balance', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(await res.json()).toEqual({ accountId: 'farmer-guard', balance: 0 })
  })

  it('auto-registers a new farmer on their first advance (issue #20)', async () => {
    const token = await loginAsBookkeeper('u-bk-auto')
    let res = await app.request('/rokar/opening', json({ amount: 500_000 }, token), env)
    expect(res.status).toBe(201)

    res = await app.request(
      '/advances',
      json({ entryId: 'e-auto-1', farmerId: 'farmer-never-registered', amount: 10_000 }, token),
      env,
    )
    expect(res.status).toBe(201)

    res = await app.request(
      '/accounts/farmer-never-registered/balance',
      { headers: { authorization: `Bearer ${token}` } },
      env,
    )
    expect(await res.json()).toEqual({ accountId: 'farmer-never-registered', balance: -10_000 })
  })

  it('rejects an unauthenticated request to a data endpoint', async () => {
    const res = await app.request('/accounts/farmers', json({ id: 'farmer-no-auth' }), env)
    expect(res.status).toBe(401)
  })
})
