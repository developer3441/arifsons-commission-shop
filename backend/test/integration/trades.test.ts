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

  it('splits a lot across 2 buyers at different rates, rolling up to one farmer bill (issue #24, ADR-0006)', async () => {
    const token = await login('trade-6')
    const auth = { headers: { authorization: `Bearer ${token}` } }
    const lotNumber = await weighLot(token, 'farmer-trade-6', 40, 101.5) // 40 bags, 100 payable kg each -> 100 maund total
    await app.request('/contacts', json({ id: 'buyer-6a', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'buyer-6b', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'thekedar-6', kind: 'thekedar' }, token), env)

    const post = await app.request(
      '/trades',
      json(
        {
          entryId: 'trade-e6',
          lotNumber,
          thekedarId: 'thekedar-6',
          lines: [
            { buyerId: 'buyer-6a', bagCount: 25, ratePerMaund: 2000 }, // 25 bags -> 62.5 maund x 2000 = 125,000
            { buyerId: 'buyer-6b', bagCount: 15, ratePerMaund: 2200 }, // 15 bags -> 37.5 maund x 2200 = 82,500
          ],
        },
        token,
      ),
      env,
    )
    expect(post.status).toBe(201)
    const body = (await post.json()) as {
      payableMaunds: number
      farmerBill: { gross: number }
      buyerInvoices: { buyerId: string; saleValue: number; total: number }[]
    }
    expect(body.payableMaunds).toBe(100) // 62.5 + 37.5
    expect(body.buyerInvoices).toHaveLength(2)
    expect(body.buyerInvoices.find((i) => i.buyerId === 'buyer-6a')!.saleValue).toBe(125_000)
    expect(body.buyerInvoices.find((i) => i.buyerId === 'buyer-6b')!.saleValue).toBe(82_500)
    expect(body.farmerBill.gross).toBe(207_500) // rolled up across both lines

    const [buyerABal, buyerBBal] = await Promise.all([
      app.request('/accounts/buyer-6a/balance', auth, env),
      app.request('/accounts/buyer-6b/balance', auth, env),
    ])
    const buyerA = (await buyerABal.json()) as { balance: number }
    const buyerB = (await buyerBBal.json()) as { balance: number }
    expect(buyerA.balance).toBe(-125_000)
    expect(buyerB.balance).toBe(-82_500)
  })

  it('rejects overselling the lot across split lines (ADR-0019)', async () => {
    const token = await login('trade-7')
    const lotNumber = await weighLot(token, 'farmer-trade-7', 10, 101.5) // only 10 bags
    await app.request('/contacts', json({ id: 'buyer-7a', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'buyer-7b', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'thekedar-7', kind: 'thekedar' }, token), env)

    const res = await app.request(
      '/trades',
      json(
        {
          entryId: 'trade-e7',
          lotNumber,
          thekedarId: 'thekedar-7',
          lines: [
            { buyerId: 'buyer-7a', bagCount: 7, ratePerMaund: 2000 },
            { buyerId: 'buyer-7b', bagCount: 7, ratePerMaund: 2000 }, // 7+7=14 > 10 bags in the lot
          ],
        },
        token,
      ),
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/oversell/i)
  })

  it('rejects a request with neither the single-buyer shorthand nor a lines array', async () => {
    const token = await login('trade-8')
    const lotNumber = await weighLot(token, 'farmer-trade-8', 5, 101.5)
    const res = await app.request(
      '/trades',
      json({ entryId: 'trade-e8', lotNumber, thekedarId: 'thekedar-8' }, token),
      env,
    )
    expect(res.status).toBe(400)
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

// Issue #54 / ADR-0032 — a trade may be submitted as one self-contained payload
// carrying the farmer, each bag's gross weight, and the buyer lines. The server
// creates the lot + bag records + postings atomically and assigns the lot number
// at that point. Idempotent on entryId (ADR-0021); oversell still rejected
// (ADR-0019). The incremental lot endpoints (tested above) are unaffected.
describe('POST /trades — atomic inline-lot submission (ADR-0032)', () => {
  const bags = (count: number, grossKg: number) => Array.from({ length: count }, () => ({ grossKg }))

  it('creates the lot + bags + postings in one request, assigns the lot number, and returns the bill', async () => {
    const token = await login('atomic-1')
    const auth = { headers: { authorization: `Bearer ${token}` } }
    await app.request('/contacts', json({ id: 'farmer-atomic-1', kind: 'zamindar', name: 'Ali' }, token), env)
    await app.request('/contacts', json({ id: 'buyer-atomic-1', kind: 'pakka', name: 'Mill' }, token), env)
    await app.request('/contacts', json({ id: 'thekedar-atomic-1', kind: 'thekedar' }, token), env)

    const post = await app.request(
      '/trades',
      json(
        {
          entryId: 'atomic-e1',
          farmerId: 'farmer-atomic-1',
          thekedarId: 'thekedar-atomic-1',
          bags: bags(40, 101.5), // 40 bags @ 101.5kg, Katt 1.5 -> 100kg each -> 100 maund
          buyerId: 'buyer-atomic-1',
          ratePerMaund: 2000,
          kattKgPerBag: 1.5,
        },
        token,
      ),
      env,
    )
    expect(post.status).toBe(201)
    const body = (await post.json()) as {
      lotNumber: number
      payableMaunds: number
      farmerBill: { gross: number; commission: number; net: number }
      buyerInvoices: { total: number }[]
    }
    expect(typeof body.lotNumber).toBe('number') // server-assigned at submit time
    expect(body.payableMaunds).toBe(100)
    expect(body.farmerBill.gross).toBe(200_000)
    expect(body.farmerBill.commission).toBe(4_000) // 2% shop default
    expect(body.buyerInvoices[0]!.total).toBe(200_000)

    // The lot + its bags were persisted — a GET reads them back.
    const lotRes = await app.request(`/lots/${body.lotNumber}`, auth, env)
    expect(lotRes.status).toBe(200)
    const lot = (await lotRes.json()) as { farmerId: string; bags: unknown[] }
    expect(lot.farmerId).toBe('farmer-atomic-1')
    expect(lot.bags).toHaveLength(40)

    // The buyer (a fresh account touched only by this trade) now owes the full
    // sale value — proof the postings landed from the inline submission.
    const buyerBal = ((await (await app.request('/accounts/buyer-atomic-1/balance', auth, env)).json()) as {
      balance: number
    }).balance
    expect(buyerBal).toBe(-200_000)
  })

  it('is idempotent on entryId: a resubmission creates no second lot and does not double-post', async () => {
    const token = await login('atomic-2')
    const auth = { headers: { authorization: `Bearer ${token}` } }
    await app.request('/contacts', json({ id: 'farmer-atomic-2', kind: 'zamindar' }, token), env)
    await app.request('/contacts', json({ id: 'buyer-atomic-2', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'thekedar-atomic-2', kind: 'thekedar' }, token), env)

    const payload = {
      entryId: 'atomic-e2',
      farmerId: 'farmer-atomic-2',
      thekedarId: 'thekedar-atomic-2',
      bags: bags(40, 101.5),
      buyerId: 'buyer-atomic-2',
      ratePerMaund: 2000,
      kattKgPerBag: 1.5,
    }

    const first = await app.request('/trades', json(payload, token), env)
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as { lotNumber: number }
    const farmerBal = async () =>
      ((await (await app.request('/accounts/farmer-atomic-2/balance', auth, env)).json()) as { balance: number }).balance
    const balAfterFirst = await farmerBal()

    const repeat = await app.request('/trades', json(payload, token), env)
    expect(repeat.status).toBe(201)
    const repeatBody = (await repeat.json()) as { lotNumber: number }
    expect(repeatBody.lotNumber).toBe(firstBody.lotNumber) // same lot, not a new one
    expect(await farmerBal()).toBe(balAfterFirst) // no double-post

    // Only one lot was ever created for this farmer.
    const lots = (await (await app.request('/lots?farmerId=farmer-atomic-2', auth, env)).json()) as unknown[]
    expect(lots).toHaveLength(1)
  })

  it('splits an inline lot across 2 buyers, rolling up to one farmer bill', async () => {
    const token = await login('atomic-3')
    await app.request('/contacts', json({ id: 'farmer-atomic-3', kind: 'zamindar' }, token), env)
    await app.request('/contacts', json({ id: 'buyer-3a', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'buyer-3b', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'thekedar-atomic-3', kind: 'thekedar' }, token), env)

    const post = await app.request(
      '/trades',
      json(
        {
          entryId: 'atomic-e3',
          farmerId: 'farmer-atomic-3',
          thekedarId: 'thekedar-atomic-3',
          bags: bags(40, 101.5),
          lines: [
            { buyerId: 'buyer-3a', bagCount: 25, ratePerMaund: 2000 },
            { buyerId: 'buyer-3b', bagCount: 15, ratePerMaund: 2200 },
          ],
        },
        token,
      ),
      env,
    )
    expect(post.status).toBe(201)
    const body = (await post.json()) as {
      payableMaunds: number
      buyerInvoices: { buyerId: string; saleValue: number }[]
    }
    expect(body.payableMaunds).toBe(100)
    expect(body.buyerInvoices.find((i) => i.buyerId === 'buyer-3a')!.saleValue).toBe(125_000)
    expect(body.buyerInvoices.find((i) => i.buyerId === 'buyer-3b')!.saleValue).toBe(82_500)
  })

  it('rejects overselling an inline lot across lines (ADR-0019) and writes nothing', async () => {
    const token = await login('atomic-4')
    const auth = { headers: { authorization: `Bearer ${token}` } }
    await app.request('/contacts', json({ id: 'farmer-atomic-4', kind: 'zamindar' }, token), env)
    await app.request('/contacts', json({ id: 'buyer-4a', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'buyer-4b', kind: 'pakka' }, token), env)
    await app.request('/contacts', json({ id: 'thekedar-atomic-4', kind: 'thekedar' }, token), env)

    const res = await app.request(
      '/trades',
      json(
        {
          entryId: 'atomic-e4',
          farmerId: 'farmer-atomic-4',
          thekedarId: 'thekedar-atomic-4',
          bags: bags(10, 101.5), // only 10 bags
          lines: [
            { buyerId: 'buyer-4a', bagCount: 7, ratePerMaund: 2000 },
            { buyerId: 'buyer-4b', bagCount: 7, ratePerMaund: 2000 }, // 14 > 10
          ],
        },
        token,
      ),
      env,
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/oversell/i)
    // No farmer ledger movement occurred.
    const bal = ((await (await app.request('/accounts/farmer-atomic-4/balance', auth, env)).json()) as { balance: number }).balance
    expect(bal).toBe(0)
  })
})
