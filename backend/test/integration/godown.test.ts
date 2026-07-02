import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #28 — Beopari: a house-buyer trade (buyerId = 'house') moves stock
// into the Godown at cost = farmer net + labour, booking no self-commission
// to revenue (ADR-0005), and stays net-worth-neutral at purchase time
// (reconciliation, ADR-0010). GET /godown is the read side.

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
})

async function login(id: string, role: 'owner' | 'bookkeeper' = 'bookkeeper'): Promise<string> {
  await new UserRepository(env.DB).createUser(id, 'Staff', `staff-${id}`, 'password123', role)
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

describe('GET /godown', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/godown', {}, env)
    expect(res.status).toBe(401)
  })

  it('starts empty', async () => {
    const token = await login('godown-empty')
    const res = await app.request('/godown', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { bags: number; netKg: number; totalCostBasis: number; averageCostPerKg: number }
    expect(body).toEqual({ bags: 0, netKg: 0, totalCostBasis: 0, averageCostPerKg: 0 })
  })
})

describe('POST /trades with buyerId = house (Beopari, ADR-0005)', () => {
  it(
    'moves stock into the Godown at cost = farmer net + labour, books no self-commission, ' +
      'and stays net-worth-neutral at purchase time (reconciliation)',
    async () => {
      const ownerToken = await login('godown-1', 'owner')
      const auth = { headers: { authorization: `Bearer ${ownerToken}` } }

      await app.request(
        '/config',
        { method: 'PUT', body: JSON.stringify({ perBagLabour: 50 }), headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` } },
        env,
      )

      const lotNumber = await weighLot(ownerToken, 'farmer-godown-1', 40, 101.5)
      await app.request('/contacts', json({ id: 'thekedar-godown-1', kind: 'thekedar' }, ownerToken), env)

      const revenueBefore = (await (await app.request('/accounts/revenue/balance', auth, env)).json()) as {
        balance: number
      }

      const trade = await app.request(
        '/trades',
        json(
          {
            entryId: 'house-trade-1',
            lotNumber,
            buyerId: 'house',
            thekedarId: 'thekedar-godown-1',
            ratePerMaund: 2000,
            kattKgPerBag: 1.5,
          },
          ownerToken,
        ),
        env,
      )
      expect(trade.status).toBe(201)
      const body = (await trade.json()) as {
        farmerBill: { net: number }
        godown?: { bags: number; netKg: number; totalCostBasis: number }
      }
      // 40 bags @ 101.5kg, Katt 1.5 -> 100 payable maund; 100 x 2000 = 200,000 bid;
      // 2% farmer commission = 4,000; labour = 40 x 50 = 2,000 (farmer-borne) -> net 194,000.
      expect(body.farmerBill.net).toBe(194_000)
      expect(body.godown).toEqual({ bags: 40, netKg: 4_000, totalCostBasis: 196_000 }) // 194,000 + 2,000 labour

      // No self-commission booked to revenue for a house purchase (ADR-0005).
      const revenueAfter = (await (await app.request('/accounts/revenue/balance', auth, env)).json()) as {
        balance: number
      }
      expect(revenueAfter.balance).toBe(revenueBefore.balance)

      // GET /godown reflects the same running state, plus the average cost/kg.
      const godownRes = await app.request('/godown', auth, env)
      const godownBody = (await godownRes.json()) as {
        bags: number
        netKg: number
        totalCostBasis: number
        averageCostPerKg: number
      }
      expect(godownBody).toEqual({ bags: 40, netKg: 4_000, totalCostBasis: 196_000, averageCostPerKg: 49 })

      // Net-worth-neutral at purchase time: True Shop Value == seed + retained
      // profit, no drift (ADR-0010) — even though Godown value went up, the
      // farmer/thekedar liabilities absorbed exactly the same amount.
      const dashboardRes = await app.request('/dashboard', auth, env)
      const dashboardBody = (await dashboardRes.json()) as {
        reconciliation: { drift: number; reconciles: boolean }
      }
      expect(dashboardBody.reconciliation.drift).toBe(0)
      expect(dashboardBody.reconciliation.reconciles).toBe(true)
    },
  )

  it('rejects mixing a house-buyer line with a real buyer line in the same trade', async () => {
    const token = await login('godown-2')
    const lotNumber = await weighLot(token, 'farmer-godown-2', 10, 101.5)
    await app.request('/contacts', json({ id: 'buyer-godown-2', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'thekedar-godown-2', kind: 'thekedar' }, token), env)

    const res = await app.request(
      '/trades',
      json(
        {
          entryId: 'house-trade-2',
          lotNumber,
          thekedarId: 'thekedar-godown-2',
          lines: [
            { buyerId: 'house', bagCount: 5, ratePerMaund: 2000 },
            { buyerId: 'buyer-godown-2', bagCount: 5, ratePerMaund: 2000 },
          ],
        },
        token,
      ),
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/house/i)
  })

  it('accumulates a running average cost across two house purchases', async () => {
    const ownerToken = await login('godown-3', 'owner')
    const auth = { headers: { authorization: `Bearer ${ownerToken}` } }

    await app.request(
      '/config',
      { method: 'PUT', body: JSON.stringify({ perBagLabour: 0 }), headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` } },
      env,
    )

    const before = (await (await app.request('/godown', auth, env)).json()) as { bags: number; netKg: number; totalCostBasis: number }

    const lot1 = await weighLot(ownerToken, 'farmer-godown-3a', 10, 101.5)
    await app.request('/contacts', json({ id: 'thekedar-godown-3', kind: 'thekedar' }, ownerToken), env)
    await app.request(
      '/trades',
      json({ entryId: 'house-trade-3a', lotNumber: lot1, buyerId: 'house', thekedarId: 'thekedar-godown-3', ratePerMaund: 2000, kattKgPerBag: 1.5 }, ownerToken),
      env,
    )
    // 10 bags -> 25 payable maund x 2000 = 50,000; 2% commission = 1,000 -> net 49,000; no labour.

    const lot2 = await weighLot(ownerToken, 'farmer-godown-3b', 10, 101.5)
    await app.request(
      '/trades',
      json({ entryId: 'house-trade-3b', lotNumber: lot2, buyerId: 'house', thekedarId: 'thekedar-godown-3', ratePerMaund: 2200, kattKgPerBag: 1.5 }, ownerToken),
      env,
    )
    // 10 bags -> 25 payable maund x 2200 = 55,000; 2% commission = 1,100 -> net 53,900; no labour.

    const after = (await (await app.request('/godown', auth, env)).json()) as {
      bags: number
      netKg: number
      totalCostBasis: number
    }
    expect(after.bags).toBe(before.bags + 20)
    expect(after.netKg).toBe(before.netKg + 2_000) // 25+25 maund = 2,000kg
    expect(after.totalCostBasis).toBe(before.totalCostBasis + 49_000 + 53_900)
  })
})
