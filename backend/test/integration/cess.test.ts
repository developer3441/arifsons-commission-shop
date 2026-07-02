import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #25 — cess accrual (via a trade, unchanged from round 1) and
// remittance to the government (ADR-0004), Owner-only and guard-railed
// against negative cash (ADR-0019).
//
// Government/Rokar are database-wide singletons, so the accrual/remittance
// narrative runs as one self-contained flow that ends in a clean state
// (cess remitted back to zero) — this avoids leaking held cess or Rokar
// balance into unrelated tests in this file.

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

describe('Cess / Government', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/cess', {}, env)
    expect(res.status).toBe(401)
  })

  it('a non-Owner cannot remit cess', async () => {
    const token = await login('cess-2')
    const res = await app.request('/cess/remit', json({ entryId: 'remit-2' }, token), env)
    expect(res.status).toBe(403)
  })

  it('rejects remitting when nothing is held (a fresh farmer/buyer with no cess accrued)', async () => {
    const token = await login('cess-3', 'owner')
    const res = await app.request('/cess/remit', json({ entryId: 'remit-3' }, token), env)
    expect(res.status).toBe(400)
  })

  it(
    'the full cess lifecycle: a sale accrues cess to the government ledger (never revenue); ' +
      'remitting without enough Rokar cash is rejected (ADR-0019); topping up Rokar then lets an ' +
      'Owner remit in full, zeroing the liability',
    async () => {
      const ownerToken = await login('cess-4-owner', 'owner')
      await app.request(
        '/config',
        {
          method: 'PUT',
          body: JSON.stringify({ cessRate: 0.01 }),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
        },
        env,
      )

      const heldBefore = (await (await app.request('/cess', { headers: { authorization: `Bearer ${ownerToken}` } }, env)).json()) as {
        held: number
      }

      const lotNumber = await weighLot(ownerToken, 'farmer-cess-4', 40, 101.5) // 100 maund payable
      await app.request('/contacts', json({ id: 'buyer-cess-4', kind: 'pakka' }, ownerToken), env)
      await app.request('/contacts', json({ id: 'thekedar-cess-4', kind: 'thekedar' }, ownerToken), env)

      const post = await app.request(
        '/trades',
        json({ entryId: 'trade-cess-4', lotNumber, buyerId: 'buyer-cess-4', thekedarId: 'thekedar-cess-4', ratePerMaund: 2000 }, ownerToken),
        env,
      )
      expect(post.status).toBe(201)
      const body = (await post.json()) as { buyerInvoices: { cess: number }[] }
      expect(body.buyerInvoices[0]!.cess).toBe(2_000) // 1% of 200,000 — never posted to revenue (trade.ts, unchanged)

      const heldAfterTrade = (await (await app.request('/cess', { headers: { authorization: `Bearer ${ownerToken}` } }, env)).json()) as {
        held: number
      }
      expect(heldAfterTrade.held).toBe(heldBefore.held + 2_000)

      // Rokar hasn't received this cash yet (the buyer hasn't paid — trades
      // are accrual-only) — top it up so the remittance below has cash to
      // draw on. The negative-cash-guard case is covered separately below.
      await app.request('/rokar/opening', json({ amount: 2_000 }, ownerToken), env)

      const rokarBefore = (await (await app.request('/accounts/rokar/balance', { headers: { authorization: `Bearer ${ownerToken}` } }, env)).json()) as {
        balance: number
      }

      const remit = await app.request('/cess/remit', json({ entryId: 'remit-4' }, ownerToken), env)
      expect(remit.status).toBe(201)
      expect(await remit.json()).toEqual({ entryId: 'remit-4', amountRemitted: heldAfterTrade.held })

      const heldAfterRemit = (await (await app.request('/cess', { headers: { authorization: `Bearer ${ownerToken}` } }, env)).json()) as {
        held: number
      }
      expect(heldAfterRemit.held).toBe(0) // fully remitted — clean for any later test in this file

      const rokarAfter = (await (await app.request('/accounts/rokar/balance', { headers: { authorization: `Bearer ${ownerToken}` } }, env)).json()) as {
        balance: number
      }
      expect(rokarAfter.balance).toBe(rokarBefore.balance - heldAfterTrade.held)
    },
  )

  it('rejects a remittance that would drive Rokar negative', async () => {
    const ownerToken = await login('cess-5-owner', 'owner')
    await app.request(
      '/config',
      {
        method: 'PUT',
        body: JSON.stringify({ cessRate: 0.01 }),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
      },
      env,
    )
    const lotNumber = await weighLot(ownerToken, 'farmer-cess-5', 40, 101.5)
    await app.request('/contacts', json({ id: 'buyer-cess-5', kind: 'pakka' }, ownerToken), env)
    await app.request('/contacts', json({ id: 'thekedar-cess-5', kind: 'thekedar' }, ownerToken), env)
    await app.request(
      '/trades',
      json({ entryId: 'trade-cess-5', lotNumber, buyerId: 'buyer-cess-5', thekedarId: 'thekedar-cess-5', ratePerMaund: 2000 }, ownerToken),
      env,
    )

    // This test never posts an opening Rokar balance, and cess accrual moves
    // no cash (trades are accrual-only) — so remitting the 2,000 cess this
    // sale just accrued must fail: there is no cash in Rokar to cover it.
    const remit = await app.request('/cess/remit', json({ entryId: 'remit-5' }, ownerToken), env)
    expect(remit.status).toBe(400)
  })
})
