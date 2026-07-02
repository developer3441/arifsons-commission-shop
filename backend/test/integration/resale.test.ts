import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #29 — reselling Godown stock to a real buyer: COGS = kg x running
// average cost, trading P&L = proceeds − COGS booked to revenue (itemised
// separately from commission, ADR-0005), rejecting over-resale (ADR-0019).

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

/** House-buy a lot so the Godown holds real stock to resell in these tests. */
async function houseBuy(
  token: string,
  farmerId: string,
  thekedarId: string,
  bagCount: number,
  entryId: string,
): Promise<void> {
  await app.request('/contacts', json({ id: thekedarId, kind: 'thekedar' }, token), env)
  const lotNumber = await weighLot(token, farmerId, bagCount, 101.5)
  const res = await app.request(
    '/trades',
    json({ entryId, lotNumber, buyerId: 'house', thekedarId, ratePerMaund: 2000, kattKgPerBag: 1.5 }, token),
    env,
  )
  expect(res.status).toBe(201)
}

describe('POST /godown/resale', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request(
      '/godown/resale',
      json({ entryId: 'x', buyerId: 'x', bagsSold: 1, netKgSold: 1, saleProceeds: 1 }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it(
    'debits the buyer, reduces the Godown by bags/kg, and books trading P&L (proceeds − avg-cost COGS) ' +
      'to revenue, separately from commission',
    async () => {
      const ownerToken = await login('resale-1', 'owner')
      const auth = { headers: { authorization: `Bearer ${ownerToken}` } }

      await app.request(
        '/config',
        { method: 'PUT', body: JSON.stringify({ perBagLabour: 0 }), headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` } },
        env,
      )

      // House-buy 40 bags @ 101.5kg, Katt 1.5 -> 100 payable maund, 4,000 net kg.
      // Sale value 200,000; 2% commission = 4,000 -> farmer net 196,000; no labour.
      await houseBuy(ownerToken, 'farmer-resale-1', 'thekedar-resale-1', 40, 'house-resale-1')

      const godownBefore = (await (await app.request('/godown', auth, env)).json()) as {
        bags: number
        netKg: number
        totalCostBasis: number
        averageCostPerKg: number
      }
      expect(godownBefore.bags).toBe(40)
      expect(godownBefore.netKg).toBe(4_000)
      expect(godownBefore.totalCostBasis).toBe(196_000) // avg 49/kg

      await app.request('/contacts', json({ id: 'buyer-resale-1', kind: 'pakka' }, ownerToken), env)
      const revenueBefore = (await (await app.request('/accounts/revenue/balance', auth, env)).json()) as {
        balance: number
      }

      // Resell the whole lot: 4,000kg at avg cost 49/kg = 196,000 COGS.
      const resale = await app.request(
        '/godown/resale',
        json({ entryId: 'resale-e1', buyerId: 'buyer-resale-1', bagsSold: 40, netKgSold: 4_000, saleProceeds: 220_000 }, ownerToken),
        env,
      )
      expect(resale.status).toBe(201)
      const resaleBody = (await resale.json()) as {
        costOfGoodsSold: number
        tradingPnL: number
        godown: { bags: number; netKg: number; totalCostBasis: number }
      }
      expect(resaleBody.costOfGoodsSold).toBe(196_000)
      expect(resaleBody.tradingPnL).toBe(24_000) // 220,000 − 196,000
      expect(resaleBody.godown).toEqual({ bags: 0, netKg: 0, totalCostBasis: 0 })

      // Buyer is debited the full sale proceeds (a receivable — negative balance).
      const buyerBal = (await (await app.request('/accounts/buyer-resale-1/balance', auth, env)).json()) as {
        balance: number
      }
      expect(buyerBal.balance).toBe(-220_000)

      // Trading P&L lands in revenue, itemised separately from commission but
      // the same account (only 7 ledgers, ADR-0004) — so revenue rises by
      // exactly the trading P&L (no commission was booked on the earlier
      // house purchase).
      const revenueAfter = (await (await app.request('/accounts/revenue/balance', auth, env)).json()) as {
        balance: number
      }
      expect(revenueAfter.balance).toBe(revenueBefore.balance + 24_000)

      // The Godown view reflects the reduced (now empty) stock.
      const godownAfter = (await (await app.request('/godown', auth, env)).json()) as {
        bags: number
        netKg: number
        totalCostBasis: number
        averageCostPerKg: number
      }
      expect(godownAfter).toEqual({ bags: 0, netKg: 0, totalCostBasis: 0, averageCostPerKg: 0 })
    },
  )

  it('a partial resale draws down the Godown proportionally, keeping the same average cost/kg', async () => {
    const ownerToken = await login('resale-2', 'owner')
    const auth = { headers: { authorization: `Bearer ${ownerToken}` } }
    await app.request(
      '/config',
      { method: 'PUT', body: JSON.stringify({ perBagLabour: 0 }), headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` } },
      env,
    )

    await houseBuy(ownerToken, 'farmer-resale-2', 'thekedar-resale-2', 40, 'house-resale-2')
    await app.request('/contacts', json({ id: 'buyer-resale-2', kind: 'pakka' }, ownerToken), env)

    const before = (await (await app.request('/godown', auth, env)).json()) as {
      bags: number
      netKg: number
      totalCostBasis: number
      averageCostPerKg: number
    }

    // Sell half the stock (20 bags, 2,000 kg).
    const resale = await app.request(
      '/godown/resale',
      json({ entryId: 'resale-e2', buyerId: 'buyer-resale-2', bagsSold: 20, netKgSold: 2_000, saleProceeds: 110_000 }, ownerToken),
      env,
    )
    expect(resale.status).toBe(201)

    const after = (await (await app.request('/godown', auth, env)).json()) as {
      bags: number
      netKg: number
      totalCostBasis: number
      averageCostPerKg: number
    }
    expect(after.bags).toBe(before.bags - 20)
    expect(after.netKg).toBe(before.netKg - 2_000)
    expect(after.averageCostPerKg).toBe(before.averageCostPerKg) // unchanged after a proportional draw-down
  })

  it('rejects selling more stock than the Godown holds (ADR-0019)', async () => {
    const ownerToken = await login('resale-3', 'owner')
    const auth = { headers: { authorization: `Bearer ${ownerToken}` } }
    await houseBuy(ownerToken, 'farmer-resale-3', 'thekedar-resale-3', 10, 'house-resale-3')
    await app.request('/contacts', json({ id: 'buyer-resale-3', kind: 'pakka' }, ownerToken), env)

    const before = (await (await app.request('/godown', auth, env)).json()) as { bags: number }

    const res = await app.request(
      '/godown/resale',
      json({ entryId: 'resale-e3', buyerId: 'buyer-resale-3', bagsSold: before.bags + 999, netKgSold: 1, saleProceeds: 10_000 }, ownerToken),
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/cannot sell more stock/i)

    // Godown must be unchanged by the rejected attempt.
    const after = (await (await app.request('/godown', auth, env)).json()) as { bags: number }
    expect(after.bags).toBe(before.bags)
  })
})
