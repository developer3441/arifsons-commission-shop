import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #27 — the Rokar-only "settle-up" actions (ADR-0019): buyer payment,
// farmer withdrawal, contractor payout, plus the Rokar cash book.
//
// Rokar is a database-wide singleton, so (as with cess.test.ts) the whole
// lifecycle runs as one self-contained narrative that only ever asserts
// *relative* Rokar movements within that one test, rather than absolute
// balances that could be contaminated by other tests in this file.

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

describe('Cash actions (buyer payment / farmer withdrawal / contractor payout)', () => {
  it('rejects unauthenticated requests', async () => {
    const buyerRes = await app.request('/payments/buyer', json({ entryId: 'x', buyerId: 'x' }), env)
    expect(buyerRes.status).toBe(401)
    const withdrawalRes = await app.request(
      '/payments/withdrawal',
      json({ entryId: 'x', farmerId: 'x', amount: 1 }),
      env,
    )
    expect(withdrawalRes.status).toBe(401)
    const payoutRes = await app.request('/payments/payout', json({ entryId: 'x', thekedarId: 'x' }), env)
    expect(payoutRes.status).toBe(401)
    const cashbookRes = await app.request('/rokar/cashbook', {}, env)
    expect(cashbookRes.status).toBe(401)
  })

  it(
    'buyer payment raises Rokar and zeroes the buyer; contractor payout lowers Rokar and zeroes the ' +
      'contractor; farmer withdrawal lowers Rokar and reduces the balance; a withdrawal that would drive ' +
      "Rokar negative is rejected (ADR-0019); the cash book shows cash in/out with a running balance",
    async () => {
      const token = await login('cash-1', 'owner')
      const auth = { headers: { authorization: `Bearer ${token}` } }

      // Give labour a nonzero rate so the contractor has wages owed to collect.
      await app.request(
        '/config',
        { method: 'PUT', body: JSON.stringify({ perBagLabour: 50 }), headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } },
        env,
      )

      const openRes = await app.request('/rokar/opening', json({ amount: 2_000_000 }, token), env)
      expect(openRes.status).toBe(201)
      let rokar = ((await openRes.json()) as { balance: number }).balance
      expect(rokar).toBe(2_000_000)

      const lotNumber = await weighLot(token, 'farmer-cash-1', 40, 101.5)
      await app.request('/contacts', json({ id: 'buyer-cash-1', kind: 'pakka' }, token), env)
      await app.request('/contacts', json({ id: 'thekedar-cash-1', kind: 'thekedar' }, token), env)

      const trade = await app.request(
        '/trades',
        json(
          {
            entryId: 'cash-trade-1',
            lotNumber,
            buyerId: 'buyer-cash-1',
            thekedarId: 'thekedar-cash-1',
            ratePerMaund: 2000,
            kattKgPerBag: 1.5,
          },
          token,
        ),
        env,
      )
      expect(trade.status).toBe(201)
      const tradeBody = (await trade.json()) as { farmerBill: { net: number } }
      expect(tradeBody.farmerBill.net).toBe(194_000) // 200,000 sale − 4,000 commission − 2,000 labour (farmer-borne)

      const buyerBalBeforeRes = await app.request('/accounts/buyer-cash-1/balance', auth, env)
      const buyerBalBefore = ((await buyerBalBeforeRes.json()) as { balance: number }).balance
      expect(buyerBalBefore).toBe(-200_000)

      const thekedarBalBeforeRes = await app.request('/accounts/thekedar-cash-1/balance', auth, env)
      const thekedarBalBefore = ((await thekedarBalBeforeRes.json()) as { balance: number }).balance
      expect(thekedarBalBefore).toBe(2_000)

      // --- buyer payment: Rokar up, buyer -> 0 ---
      const buyerPay = await app.request(
        '/payments/buyer',
        json({ entryId: 'pay-buyer-cash-1', buyerId: 'buyer-cash-1' }, token),
        env,
      )
      expect(buyerPay.status).toBe(201)
      const buyerPayBody = (await buyerPay.json()) as { amount: number }
      expect(buyerPayBody.amount).toBe(200_000)

      const buyerBalAfterRes = await app.request('/accounts/buyer-cash-1/balance', auth, env)
      expect(((await buyerBalAfterRes.json()) as { balance: number }).balance).toBe(0)

      rokar += 200_000
      const rokarAfterBuyerRes = await app.request('/accounts/rokar/balance', auth, env)
      expect(((await rokarAfterBuyerRes.json()) as { balance: number }).balance).toBe(rokar)

      // Repeat buyer payment is rejected — no outstanding receivable left.
      const buyerPayRepeat = await app.request(
        '/payments/buyer',
        json({ entryId: 'pay-buyer-cash-1-again', buyerId: 'buyer-cash-1' }, token),
        env,
      )
      expect(buyerPayRepeat.status).toBe(400)

      // --- contractor payout: Rokar down, thekedar -> 0 ---
      const payout = await app.request(
        '/payments/payout',
        json({ entryId: 'payout-cash-1', thekedarId: 'thekedar-cash-1' }, token),
        env,
      )
      expect(payout.status).toBe(201)
      const payoutBody = (await payout.json()) as { amount: number }
      expect(payoutBody.amount).toBe(-2_000)

      const thekedarBalAfterRes = await app.request('/accounts/thekedar-cash-1/balance', auth, env)
      expect(((await thekedarBalAfterRes.json()) as { balance: number }).balance).toBe(0)

      rokar -= 2_000
      const rokarAfterPayoutRes = await app.request('/accounts/rokar/balance', auth, env)
      expect(((await rokarAfterPayoutRes.json()) as { balance: number }).balance).toBe(rokar)

      // --- farmer withdrawal: Rokar down, balance reduced (not zeroed) ---
      const withdrawal = await app.request(
        '/payments/withdrawal',
        json({ entryId: 'withdraw-cash-1', farmerId: 'farmer-cash-1', amount: 50_000 }, token),
        env,
      )
      expect(withdrawal.status).toBe(201)

      const farmerBalAfterRes = await app.request('/accounts/farmer-cash-1/balance', auth, env)
      expect(((await farmerBalAfterRes.json()) as { balance: number }).balance).toBe(194_000 - 50_000)

      rokar -= 50_000
      const rokarAfterWithdrawalRes = await app.request('/accounts/rokar/balance', auth, env)
      expect(((await rokarAfterWithdrawalRes.json()) as { balance: number }).balance).toBe(rokar)

      // --- a withdrawal that would drive Rokar negative is rejected (ADR-0019) ---
      const oversizedWithdrawal = await app.request(
        '/payments/withdrawal',
        json({ entryId: 'withdraw-cash-1-too-big', farmerId: 'farmer-cash-1', amount: rokar + 1_000_000 }, token),
        env,
      )
      expect(oversizedWithdrawal.status).toBe(400)
      const oversizedBody = (await oversizedWithdrawal.json()) as { error: string }
      expect(oversizedBody.error).toMatch(/insufficient cash/i)

      // Rokar must be unchanged by the rejected attempt.
      const rokarAfterRejectionRes = await app.request('/accounts/rokar/balance', auth, env)
      expect(((await rokarAfterRejectionRes.json()) as { balance: number }).balance).toBe(rokar)

      // --- the cash book: cash in/out, in order, with a running balance ---
      const cashbookRes = await app.request('/rokar/cashbook', auth, env)
      expect(cashbookRes.status).toBe(200)
      const cashbook = (await cashbookRes.json()) as {
        balance: number
        entries: { entryId: string; kind: string; amount: number; balanceAfter: number }[]
      }
      expect(cashbook.balance).toBe(rokar)
      expect(cashbook.entries.map((e) => e.entryId)).toEqual([
        'opening-rokar',
        'pay-buyer-cash-1',
        'payout-cash-1',
        'withdraw-cash-1',
      ])
      expect(cashbook.entries.at(-1)!.balanceAfter).toBe(rokar)
      expect(cashbook.entries.find((e) => e.entryId === 'pay-buyer-cash-1')!.amount).toBe(200_000)
      expect(cashbook.entries.find((e) => e.entryId === 'payout-cash-1')!.amount).toBe(-2_000)
      expect(cashbook.entries.find((e) => e.entryId === 'withdraw-cash-1')!.amount).toBe(-50_000)
    },
  )
})
