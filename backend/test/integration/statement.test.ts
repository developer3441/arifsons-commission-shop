import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #26 — Farmer statement & settlement cascade view: GET
// /contacts/{id}/statement returns every entry touching a farmer, in order,
// with a running balance and (for a sale) the settlement cascade breakdown
// (ADR-0008, ADR-0010).

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

async function weighLot(token: string, farmerId: string, bagCount: number, grossKg: number): Promise<number> {
  const create = await app.request('/lots', json({ farmerId }, token), env)
  const { lotNumber } = (await create.json()) as { lotNumber: number }
  for (let i = 0; i < bagCount; i++) {
    await app.request(`/lots/${lotNumber}/bags`, json({ grossKg }, token), env)
  }
  return lotNumber
}

describe('GET /contacts/{id}/statement', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/contacts/farmer-x/statement', {}, env)
    expect(res.status).toBe(401)
  })

  it('404s for a nonexistent contact', async () => {
    const token = await login('stmt-1')
    const res = await app.request('/contacts/nobody/statement', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(res.status).toBe(404)
  })

  it('400s for a non-farmer contact (e.g. a buyer)', async () => {
    const token = await login('stmt-2')
    await app.request('/contacts', json({ id: 'buyer-stmt-2', kind: 'pakka' }, token), env)
    const res = await app.request(
      '/contacts/buyer-stmt-2/statement',
      { headers: { authorization: `Bearer ${token}` } },
      env,
    )
    expect(res.status).toBe(400)
  })

  it('returns an empty statement for a farmer with no entries yet', async () => {
    const token = await login('stmt-3')
    await app.request('/contacts', json({ id: 'farmer-stmt-3', kind: 'zamindar' }, token), env)
    const res = await app.request(
      '/contacts/farmer-stmt-3/statement',
      { headers: { authorization: `Bearer ${token}` } },
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { farmerId: string; balance: number; entries: unknown[] }
    expect(body).toEqual({ farmerId: 'farmer-stmt-3', balance: 0, entries: [] })
  })

  it(
    'shows the running statement + settlement cascade breakdown: an advance debt auto-repaid ' +
      'from a later sale, with the surplus held (ADR-0008)',
    async () => {
      const token = await login('stmt-4')

      await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
      await app.request(
        '/advances',
        json({ entryId: 'adv-stmt-4', farmerId: 'farmer-stmt-4', amount: 50_000 }, token),
        env,
      )

      const lotNumber = await weighLot(token, 'farmer-stmt-4', 40, 101.5)
      await app.request('/contacts', json({ id: 'buyer-stmt-4', kind: 'pakka' }, token), env)
      await app.request('/contacts', json({ id: 'thekedar-stmt-4', kind: 'thekedar' }, token), env)

      const trade = await app.request(
        '/trades',
        json(
          {
            entryId: 'trade-stmt-4',
            lotNumber,
            buyerId: 'buyer-stmt-4',
            thekedarId: 'thekedar-stmt-4',
            ratePerMaund: 2000,
            kattKgPerBag: 1.5,
          },
          token,
        ),
        env,
      )
      expect(trade.status).toBe(201)

      const res = await app.request(
        '/contacts/farmer-stmt-4/statement',
        { headers: { authorization: `Bearer ${token}` } },
        env,
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        farmerId: string
        balance: number
        entries: {
          entryId: string
          kind: string
          amount: number
          balanceAfter: number
          settlement?: { debtRepaid: number; heldSurplus: number; remainingDebt: number; newBalance: number }
        }[]
      }

      expect(body.entries).toHaveLength(2) // the advance, then the trade

      const advanceLine = body.entries[0]!
      expect(advanceLine.entryId).toBe('adv-stmt-4')
      expect(advanceLine.kind).toBe('peshi_advance')
      expect(advanceLine.amount).toBe(-50_000)
      expect(advanceLine.balanceAfter).toBe(-50_000)
      expect(advanceLine.settlement).toBeUndefined() // not a sale

      const tradeLine = body.entries[1]!
      expect(tradeLine.entryId).toBe('trade-stmt-4')
      expect(tradeLine.kind).toBe('trade')
      expect(tradeLine.amount).toBe(196_000) // farmer net proceeds (200,000 sale − 4,000 commission; no labour/bag charge by default)
      expect(tradeLine.balanceAfter).toBe(146_000) // 196,000 − 50,000 debt cleared
      expect(tradeLine.settlement).toEqual({
        debtRepaid: 50_000,
        heldSurplus: 146_000,
        remainingDebt: 0,
        newBalance: 146_000,
      })

      expect(body.balance).toBe(146_000) // matches the contact's own balance
      expect(body.balance).toBe(tradeLine.balanceAfter)
    },
  )
})
