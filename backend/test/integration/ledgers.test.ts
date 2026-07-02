import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #31 — the Ledgers grid: all 7 ledgers as colour-coded cards, drilling
// into one ledger's accounts, then into one account's entries (ADR-0004/0010).

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

describe('GET /ledgers', () => {
  it('rejects an unauthenticated request', async () => {
    expect((await app.request('/ledgers', {}, env)).status).toBe(401)
    expect((await app.request('/ledgers/zamindar/accounts', {}, env)).status).toBe(401)
    expect((await app.request('/ledgers/accounts/x/entries', {}, env)).status).toBe(401)
  })

  it('lists all 7 ledgers, in the fixed ADR-0004 order, with correct balances', async () => {
    const token = await login('ledgers-1')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
    await app.request('/advances', json({ entryId: 'adv-ledgers-1', farmerId: 'farmer-ledgers-1', amount: 200_000 }, token), env)

    const res = await app.request('/ledgers', auth, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { kind: string; balance: number }[]
    expect(body.map((l) => l.kind)).toEqual(['rokar', 'zamindar', 'beopari', 'thekedar', 'pakka', 'revenue', 'government'])

    const rokar = body.find((l) => l.kind === 'rokar')!
    expect(rokar.balance).toBe(800_000) // 1,000,000 opening − 200,000 advance

    const zamindar = body.find((l) => l.kind === 'zamindar')!
    expect(zamindar.balance).toBe(-200_000) // farmer owes the shop (advance debt)
  })
})

describe('GET /ledgers/{kind}/accounts', () => {
  it('rejects a kind that is not one of the 7 ledgers', async () => {
    const token = await login('ledgers-2')
    const res = await app.request('/ledgers/nonsense/accounts', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(res.status).toBe(400)
  })

  it('returns the fixed single account for a singleton ledger (rokar)', async () => {
    const token = await login('ledgers-3')
    const auth = { headers: { authorization: `Bearer ${token}` } }
    // 'opening-rokar' is a fixed, idempotent entry id (ledger.ts) — a second
    // /rokar/opening call within this shared-D1 file is a safe no-op, so
    // assert against the account's own current balance rather than a fresh
    // absolute value (same file-shares-one-D1-instance caution as elsewhere).
    await app.request('/rokar/opening', json({ amount: 500_000 }, token), env)
    const expected = (await (await app.request('/accounts/rokar/balance', auth, env)).json()) as { balance: number }

    const res = await app.request('/ledgers/rokar/accounts', auth, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; balance: number }[]
    expect(body).toEqual([{ id: 'rokar', balance: expected.balance }])
  })

  it('lists every registered account for a multi-account ledger (zamindar)', async () => {
    const token = await login('ledgers-4')
    await app.request('/contacts', json({ id: 'farmer-ledgers-4a', kind: 'zamindar', name: 'Ali' }, token), env)
    await app.request('/contacts', json({ id: 'farmer-ledgers-4b', kind: 'zamindar', name: 'Bilal' }, token), env)
    await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
    await app.request('/advances', json({ entryId: 'adv-ledgers-4', farmerId: 'farmer-ledgers-4a', amount: 30_000 }, token), env)

    const res = await app.request('/ledgers/zamindar/accounts', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; name?: string; balance: number }[]
    const a = body.find((r) => r.id === 'farmer-ledgers-4a')!
    const b = body.find((r) => r.id === 'farmer-ledgers-4b')!
    expect(a.balance).toBe(-30_000)
    expect(b.balance).toBe(0)
    expect(a.name).toBe('Ali')
  })
})

describe('GET /ledgers/accounts/{id}/entries — drill-down', () => {
  it('shows every entry that touched the account, in order, with a running balance', async () => {
    const token = await login('ledgers-5')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
    await app.request('/advances', json({ entryId: 'adv-ledgers-5a', farmerId: 'farmer-ledgers-5', amount: 50_000 }, token), env)
    await app.request('/advances', json({ entryId: 'adv-ledgers-5b', farmerId: 'farmer-ledgers-5', amount: 20_000 }, token), env)

    const res = await app.request('/ledgers/accounts/farmer-ledgers-5/entries', auth, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      accountId: string
      balance: number
      entries: { entryId: string; kind: string; amount: number; balanceAfter: number }[]
    }
    expect(body.accountId).toBe('farmer-ledgers-5')
    expect(body.balance).toBe(-70_000)
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0]).toEqual({ entryId: 'adv-ledgers-5a', kind: 'peshi_advance', amount: -50_000, balanceAfter: -50_000 })
    expect(body.entries[1]).toEqual({ entryId: 'adv-ledgers-5b', kind: 'peshi_advance', amount: -20_000, balanceAfter: -70_000 })
  })

  it('returns an empty statement for an account with no entries yet', async () => {
    const token = await login('ledgers-6')
    const res = await app.request(
      '/ledgers/accounts/nobody/entries',
      { headers: { authorization: `Bearer ${token}` } },
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { accountId: string; balance: number; entries: unknown[] }
    expect(body).toEqual({ accountId: 'nobody', balance: 0, entries: [] })
  })
})
