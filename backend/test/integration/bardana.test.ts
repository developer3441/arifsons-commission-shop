import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #21 — Bardana lending & asset tracking (ADR-0001/0010): lend/return
// bags to a farmer, tracked as bags-out per farmer, with the money value
// already flowing into True Shop Value via the farmer's ledger balance.

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
})

async function login(id: string): Promise<string> {
  await new UserRepository(env.DB).createUser(id, 'Staff', `staff-${id}`, 'password123', 'bookkeeper')
  const res = await app.request('/auth/login', json({ username: `staff-${id}`, password: 'password123' }), env)
  const { token } = (await res.json()) as { token: string }
  return token
}

describe('Bardana lending API', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/bardana', {}, env)
    expect(res.status).toBe(401)
  })

  it('lending bags records a bags-out asset against the farmer, and the farmer ledger reflects it', async () => {
    const token = await login('bard-1')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    const lend = await app.request(
      '/bardana/lend',
      json({ entryId: 'lend-1', farmerId: 'farmer-bard-1', bags: 5, bagValue: 100 }, token),
      env,
    )
    expect(lend.status).toBe(201)
    expect(await lend.json()).toEqual({ farmerId: 'farmer-bard-1', bagsOut: 5, bagValue: 100 })

    // farmer now owes 500 (5 bags x 100) — asset counted via the farmer's own balance
    const balance = await app.request('/accounts/farmer-bard-1/balance', auth, env)
    expect(await balance.json()).toEqual({ accountId: 'farmer-bard-1', balance: -500 })

    const list = await app.request('/bardana', auth, env)
    const loans = (await list.json()) as { farmerId: string; bagsOut: number }[]
    expect(loans.find((l) => l.farmerId === 'farmer-bard-1')).toEqual({
      farmerId: 'farmer-bard-1',
      bagsOut: 5,
      bagValue: 100,
    })
  })

  it('lending more bags to the same farmer accumulates bags-out', async () => {
    const token = await login('bard-2')
    await app.request('/bardana/lend', json({ entryId: 'l1-bard2', farmerId: 'farmer-bard-2', bags: 3, bagValue: 50 }, token), env)
    const second = await app.request(
      '/bardana/lend',
      json({ entryId: 'l2-bard2', farmerId: 'farmer-bard-2', bags: 2, bagValue: 60 }, token),
      env,
    )
    expect(await second.json()).toEqual({ farmerId: 'farmer-bard-2', bagsOut: 5, bagValue: 60 })
  })

  it('returning bags reduces bags-out and credits the farmer back', async () => {
    const token = await login('bard-3')
    const auth = { headers: { authorization: `Bearer ${token}` } }
    await app.request('/bardana/lend', json({ entryId: 'l1-bard3', farmerId: 'farmer-bard-3', bags: 5, bagValue: 100 }, token), env)

    const ret = await app.request(
      '/bardana/return',
      json({ entryId: 'ret-1-bard3', farmerId: 'farmer-bard-3', bags: 2 }, token),
      env,
    )
    expect(ret.status).toBe(201)
    expect(await ret.json()).toEqual({ farmerId: 'farmer-bard-3', bagsOut: 3, bagValue: 100 })

    // farmer's debt reduced by 200 (2 bags x 100): -500 + 200 = -300
    const balance = await app.request('/accounts/farmer-bard-3/balance', auth, env)
    expect(await balance.json()).toEqual({ accountId: 'farmer-bard-3', balance: -300 })
  })

  it('rejects returning more bags than are outstanding', async () => {
    const token = await login('bard-4')
    await app.request('/bardana/lend', json({ entryId: 'l1-bard4', farmerId: 'farmer-bard-4', bags: 2, bagValue: 100 }, token), env)
    const res = await app.request(
      '/bardana/return',
      json({ entryId: 'ret-1-bard4', farmerId: 'farmer-bard-4', bags: 5 }, token),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('rejects a return when there is no outstanding loan at all', async () => {
    const token = await login('bard-5')
    const res = await app.request(
      '/bardana/return',
      json({ entryId: 'ret-1-neverlent', farmerId: 'farmer-never-lent', bags: 1 }, token),
      env,
    )
    expect(res.status).toBe(404)
  })

  it('a fully returned loan restores True Shop Value to exactly its pre-lend state', async () => {
    // While a bardana loan is outstanding, True Shop Value is temporarily
    // higher by its value (the farmer receivable it creates) — this is by
    // design (ADR-0010, round 1's bardana model: reconciliation self-corrects
    // once the loan is resolved via a trade sale, verified in
    // test/domain/bardana.test.ts's farmer-/buyer-borne settlement tests).
    // What must hold here is narrower: lending then fully returning the same
    // bags is a complete round-trip that changes nothing.
    const token = await login('bard-6')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    const before = await app.request('/dashboard', auth, env)
    const beforeSnapshot = (await before.json()) as { trueShopValue: number }

    await app.request('/bardana/lend', json({ entryId: 'l1-bard6', farmerId: 'farmer-bard-6', bags: 5, bagValue: 100 }, token), env)
    const midLend = await app.request('/dashboard', auth, env)
    const midSnapshot = (await midLend.json()) as { trueShopValue: number }
    expect(midSnapshot.trueShopValue).toBe(beforeSnapshot.trueShopValue + 500) // the outstanding loan's value

    await app.request('/bardana/return', json({ entryId: 'ret-1-bard6', farmerId: 'farmer-bard-6', bags: 5 }, token), env)

    const after = await app.request('/dashboard', auth, env)
    const afterSnapshot = (await after.json()) as { trueShopValue: number }
    expect(afterSnapshot.trueShopValue).toBe(beforeSnapshot.trueShopValue)
  })
})
