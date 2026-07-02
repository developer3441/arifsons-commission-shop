import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #23 — the core single-buyer trade, end-to-end: HTTP route -> pure
// trade engine (unchanged from round 1) -> D1 -> Kacha bill / Pakka invoice /
// settlement breakdown. Governing: ADR-0001, ADR-0007, ADR-0008, ADR-0012.

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

describe('POST /trades', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/trades', json({}), env)
    expect(res.status).toBe(401)
  })

  it(
    'completes the single-buyer flow: posts to farmer/buyer/contractor/revenue summing to zero, ' +
      'with itemised bills, and is idempotent on a repeat submission',
    async () => {
      const token = await login('trade-1')
      const auth = { headers: { authorization: `Bearer ${token}` } }

      // Shop defaults (fresh, per-file D1): 2% farmer commission, 0% buyer
      // commission, Katt 1.5, no labour/bag charge, no cess.
      const lotNumber = await weighLot(token, 'farmer-trade-1', 40, 101.5)

      await app.request('/accounts/farmers', json({ id: 'farmer-trade-1', name: 'Ali' }, token), env)
      await app.request('/contacts', json({ id: 'buyer-trade-1', kind: 'pakka', name: 'Mill' }, token), env)
      await app.request('/contacts', json({ id: 'thekedar-trade-1', kind: 'thekedar', name: 'Saeed' }, token), env)

      const post = await app.request(
        '/trades',
        json(
          {
            entryId: 'trade-e1',
            lotNumber,
            buyerId: 'buyer-trade-1',
            thekedarId: 'thekedar-trade-1',
            ratePerMaund: 2000,
            kattKgPerBag: 1.5,
          },
          token,
        ),
        env,
      )
      expect(post.status).toBe(201)
      const body = (await post.json()) as {
        payableMaunds: number
        farmerBill: { gross: number; commission: number; labour: number; net: number }
        buyerInvoices: { total: number }[]
      }
      // 40 bags @ 101.5kg, Katt 1.5 -> 100kg payable each -> 100 maund; 100 x 2000 = 200,000
      expect(body.payableMaunds).toBe(100)
      expect(body.farmerBill.gross).toBe(200_000)
      expect(body.farmerBill.commission).toBe(4_000) // 2%
      expect(body.buyerInvoices[0]!.total).toBe(200_000) // no buyer-side charges by default

      const farmerBalRes = await app.request('/accounts/farmer-trade-1/balance', auth, env)
      const buyerBalRes = await app.request('/accounts/buyer-trade-1/balance', auth, env)
      const thekedarBalRes = await app.request('/accounts/thekedar-trade-1/balance', auth, env)
      const revenueBalRes = await app.request('/accounts/revenue/balance', auth, env)
      const farmerBal = (await farmerBalRes.json()) as { balance: number }
      const buyerBal = (await buyerBalRes.json()) as { balance: number }
      const thekedarBal = (await thekedarBalRes.json()) as { balance: number }
      const revenueBal = (await revenueBalRes.json()) as { balance: number }
      const balances = [farmerBal, buyerBal, thekedarBal, revenueBal]
      expect(balances.reduce((sum, b) => sum + b.balance, 0)).toBe(0) // the whole entry sums to zero

      // Idempotent: resubmitting the same entryId must not double-post.
      const repeat = await app.request(
        '/trades',
        json(
          {
            entryId: 'trade-e1',
            lotNumber,
            buyerId: 'buyer-trade-1',
            thekedarId: 'thekedar-trade-1',
            ratePerMaund: 2000,
            kattKgPerBag: 1.5,
          },
          token,
        ),
        env,
      )
      expect(repeat.status).toBe(201)
      const repeatBalRes = await app.request('/accounts/farmer-trade-1/balance', auth, env)
      const farmerBalAfterRepeat = (await repeatBalRes.json()) as { balance: number }
      expect(farmerBalAfterRepeat.balance).toBe(farmerBal.balance) // unchanged
    },
  )

  it('auto-repays an outstanding advance from proceeds before the farmer holds a surplus (ADR-0008)', async () => {
    const token = await login('trade-2')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
    await app.request('/advances', json({ entryId: 'adv-trade-2', farmerId: 'farmer-trade-2', amount: 50_000 }, token), env)

    const lotNumber = await weighLot(token, 'farmer-trade-2', 40, 101.5)
    await app.request('/contacts', json({ id: 'buyer-trade-2', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'thekedar-trade-2', kind: 'thekedar' }, token), env)

    const post = await app.request(
      '/trades',
      json(
        {
          entryId: 'trade-e2',
          lotNumber,
          buyerId: 'buyer-trade-2',
          thekedarId: 'thekedar-trade-2',
          ratePerMaund: 2000,
          kattKgPerBag: 1.5,
        },
        token,
      ),
      env,
    )
    expect(post.status).toBe(201)
    const body = (await post.json()) as {
      settlement: { debtRepaid: number; heldSurplus: number; remainingDebt: number; newBalance: number }
    }
    expect(body.settlement.debtRepaid).toBe(50_000)
    expect(body.settlement.remainingDebt).toBe(0)
    expect(body.settlement.heldSurplus).toBeGreaterThan(0)

    const farmerBal = (await (await app.request('/accounts/farmer-trade-2/balance', auth, env)).json()) as {
      balance: number
    }
    expect(farmerBal.balance).toBe(body.settlement.newBalance)
    expect(farmerBal.balance).toBeGreaterThan(0) // now a held credit, not a debt
  })

  it('applies a per-customer bearer override at trade time (issue #17 + #23 wired together)', async () => {
    const token = await login('trade-3')
    const ownerToken = await (async () => {
      await new UserRepository(env.DB).createUser('owner-trade-3', 'Owner', 'owner-trade-3', 'password123', 'owner')
      const res = await app.request('/auth/login', json({ username: 'owner-trade-3', password: 'password123' }), env)
      return ((await res.json()) as { token: string }).token
    })()
    // Give labour a nonzero rate so shifting its bearer is observable.
    await app.request(
      '/config',
      { method: 'PUT', body: JSON.stringify({ perBagLabour: 50 }), headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` } },
      env,
    )
    await app.request(
      '/contacts',
      json({ id: 'farmer-trade-3', kind: 'zamindar', labourBearer: 'buyer' }, token),
      env,
    )
    const lotNumber = await weighLot(token, 'farmer-trade-3', 10, 101.5)
    await app.request('/contacts', json({ id: 'buyer-trade-3', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'thekedar-trade-3', kind: 'thekedar' }, token), env)

    const post = await app.request(
      '/trades',
      json(
        {
          entryId: 'trade-e3',
          lotNumber,
          buyerId: 'buyer-trade-3',
          thekedarId: 'thekedar-trade-3',
          ratePerMaund: 2000,
          kattKgPerBag: 1.5,
        },
        token,
      ),
      env,
    )
    const body = (await post.json()) as {
      farmerBill: { labour: number }
      buyerInvoices: { labourCharge: number }[]
    }
    expect(body.farmerBill.labour).toBe(0) // buyer bears it per the farmer's contact override
    expect(body.buyerInvoices[0]!.labourCharge).toBeGreaterThan(0)
  })

  it('rejects a trade against a lot with no weighed bags', async () => {
    const token = await login('trade-4')
    const create = await app.request('/lots', json({ farmerId: 'farmer-trade-4' }, token), env)
    const { lotNumber } = (await create.json()) as { lotNumber: number }

    const res = await app.request(
      '/trades',
      json({ entryId: 'trade-e4', lotNumber, buyerId: 'buyer-x', thekedarId: 'thekedar-x', ratePerMaund: 2000 }, token),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('rejects a trade against a nonexistent lot', async () => {
    const token = await login('trade-5')
    const res = await app.request(
      '/trades',
      json({ entryId: 'trade-e5', lotNumber: 999999, buyerId: 'buyer-x', thekedarId: 'thekedar-x', ratePerMaund: 2000 }, token),
      env,
    )
    expect(res.status).toBe(404)
  })
})
