import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'

// Issue #1 walking skeleton, full stack: HTTP route → pure engine → D1 → read back.
// Proves the same path the deployed Worker runs, against a real (Miniflare) D1.

const json = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
})

describe('ledger API — end-to-end through D1', () => {
  it('a Peshi advance posts farmer -N and Rokar -N, readable back', async () => {
    let res = await app.request('/accounts/farmers', json({ id: 'farmer-ali', name: 'Ali' }), env)
    expect(res.status).toBe(201)

    res = await app.request('/rokar/opening', json({ amount: 1_000_000 }), env)
    expect(res.status).toBe(201)

    res = await app.request(
      '/advances',
      json({ entryId: 'e1', farmerId: 'farmer-ali', amount: 200_000 }),
      env,
    )
    expect(res.status).toBe(201)

    res = await app.request('/accounts/farmer-ali/balance', {}, env)
    expect(await res.json()).toEqual({ accountId: 'farmer-ali', balance: -200_000 })

    res = await app.request('/accounts/rokar/balance', {}, env)
    expect(await res.json()).toEqual({ accountId: 'rokar', balance: 800_000 })
  })
})
