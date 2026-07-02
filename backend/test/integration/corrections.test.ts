import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #30 — corrections & the append-only change log (ADR-0011, clarified;
// ADR-0021). An edit/delete never rewrites a posting: it appends a reversal
// (and, for an edit, a fresh corrected entry) plus a change-log row. Editing
// a settled entry warns and is Owner-only; the change is still logged.

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

describe('Corrections & the change log', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await app.request('/entries/x', {}, env)).status).toBe(401)
    expect((await app.request('/entries/x/edit', json({ reversalEntryId: 'r', correctedEntryId: 'c', postings: [] }))).status).toBe(401)
    expect((await app.request('/entries/x/delete', json({ reversalEntryId: 'r' }))).status).toBe(401)
    expect((await app.request('/changelog', {}, env)).status).toBe(401)
  })

  it('GET /entries/{id} 404s for a nonexistent entry', async () => {
    const token = await login('corr-1')
    const res = await app.request('/entries/nope', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(res.status).toBe(404)
  })

  it(
    'editing an unsettled entry (any authenticated role) appends a reversal + corrected entry, ' +
      'recomputes the balance, and logs the change with no warning',
    async () => {
      const token = await login('corr-2') // bookkeeper — not Owner
      const auth = { headers: { authorization: `Bearer ${token}` } }

      await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
      await app.request('/advances', json({ entryId: 'adv-corr-2', farmerId: 'farmer-corr-2', amount: 200_000 }, token), env)
      const before = (await (await app.request('/accounts/farmer-corr-2/balance', auth, env)).json()) as { balance: number }
      expect(before.balance).toBe(-200_000)

      const original = (await (await app.request('/entries/adv-corr-2', auth, env)).json()) as {
        id: string
        kind: string
        postings: { accountId: string; amount: number }[]
      }
      expect(original.kind).toBe('peshi_advance')

      // Corrected postings: half the mis-entered amount.
      const correctedPostings = original.postings.map((p) => ({ accountId: p.accountId, amount: p.amount / 2 }))

      const edit = await app.request(
        '/entries/adv-corr-2/edit',
        json({ reversalEntryId: 'adv-corr-2-rev-1', correctedEntryId: 'adv-corr-2-corrected-1', postings: correctedPostings }, token),
        env,
      )
      expect(edit.status).toBe(201)
      const editBody = (await edit.json()) as { warning?: string }
      expect(editBody.warning).toBeUndefined() // not settled

      const after = (await (await app.request('/accounts/farmer-corr-2/balance', auth, env)).json()) as { balance: number }
      expect(after.balance).toBe(-100_000) // corrected to half

      // The original posting is still on record (never rewritten) — visible
      // via the change log's `before` snapshot.
      const log = (await (await app.request('/changelog', auth, env)).json()) as {
        entryId: string
        action: string
        before: { postings: { amount: number }[] }
        after: { postings: { amount: number }[] } | null
        actor: string
      }[]
      const row = log.find((r) => r.entryId === 'adv-corr-2')!
      expect(row.action).toBe('edit')
      expect(row.before.postings.find((p) => p.amount !== 0)!.amount).toBeLessThan(0) // original -200,000 posting preserved
      expect(row.after!.postings).toEqual(correctedPostings)
      expect(row.actor).toBeTruthy()
    },
  )

  it(
    'editing a settled entry warns, is rejected for a non-Owner, and succeeds (with the warning) for an Owner',
    async () => {
      const ownerToken = await login('corr-3-owner', 'owner')
      const bookkeeperToken = await login('corr-3-staff', 'bookkeeper')
      const auth = { headers: { authorization: `Bearer ${ownerToken}` } }

      await app.request('/rokar/opening', json({ amount: 1_000_000 }, ownerToken), env)

      // A buyer_payment settles the trade's buyer receivable, marking the
      // original trade entry "settled" downstream (ADR-0011: cess remitted,
      // contractor paid, or buyer cleared).
      await app.request('/contacts', json({ id: 'buyer-corr-3', kind: 'pakka' }, ownerToken), env)
      await app.request('/contacts', json({ id: 'thekedar-corr-3', kind: 'thekedar' }, ownerToken), env)
      const lotCreate = await app.request('/lots', json({ farmerId: 'farmer-corr-3' }, ownerToken), env)
      const { lotNumber } = (await lotCreate.json()) as { lotNumber: number }
      await app.request(`/lots/${lotNumber}/bags`, json({ grossKg: 101.5 }, ownerToken), env)
      const trade = await app.request(
        '/trades',
        json({ entryId: 'trade-corr-3', lotNumber, buyerId: 'buyer-corr-3', thekedarId: 'thekedar-corr-3', ratePerMaund: 2000, kattKgPerBag: 1.5 }, ownerToken),
        env,
      )
      expect(trade.status).toBe(201)

      // Settle it: the buyer pays in full.
      const buyerPay = await app.request('/payments/buyer', json({ entryId: 'pay-corr-3', buyerId: 'buyer-corr-3' }, ownerToken), env)
      expect(buyerPay.status).toBe(201)

      const originalTrade = (await (await app.request('/entries/trade-corr-3', auth, env)).json()) as {
        postings: { accountId: string; amount: number }[]
      }

      // A non-Owner cannot edit this settled entry.
      const asBookkeeper = await app.request(
        '/entries/trade-corr-3/edit',
        json({ reversalEntryId: 'trade-corr-3-rev', correctedEntryId: 'trade-corr-3-corrected', postings: originalTrade.postings }, bookkeeperToken),
        env,
      )
      expect(asBookkeeper.status).toBe(403)

      // An Owner can — with a warning, and the change is still logged.
      const asOwner = await app.request(
        '/entries/trade-corr-3/edit',
        json({ reversalEntryId: 'trade-corr-3-rev', correctedEntryId: 'trade-corr-3-corrected', postings: originalTrade.postings }, ownerToken),
        env,
      )
      expect(asOwner.status).toBe(201)
      const body = (await asOwner.json()) as { warning?: string }
      expect(body.warning).toMatch(/settled/i)

      const log = (await (await app.request('/changelog', auth, env)).json()) as { entryId: string; action: string }[]
      expect(log.some((r) => r.entryId === 'trade-corr-3' && r.action === 'edit')).toBe(true)
    },
  )

  it('deleting an entry appends a reversal, zeroes its effect, and logs before -> null', async () => {
    const token = await login('corr-4', 'owner')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
    await app.request('/advances', json({ entryId: 'adv-corr-4', farmerId: 'farmer-corr-4', amount: 75_000 }, token), env)
    const before = (await (await app.request('/accounts/farmer-corr-4/balance', auth, env)).json()) as { balance: number }
    expect(before.balance).toBe(-75_000)

    const del = await app.request('/entries/adv-corr-4/delete', json({ reversalEntryId: 'adv-corr-4-rev' }, token), env)
    expect(del.status).toBe(201)

    const after = (await (await app.request('/accounts/farmer-corr-4/balance', auth, env)).json()) as { balance: number }
    expect(after.balance).toBe(0)

    const log = (await (await app.request('/changelog', auth, env)).json()) as {
      entryId: string
      action: string
      after: unknown
    }[]
    const row = log.find((r) => r.entryId === 'adv-corr-4')!
    expect(row.action).toBe('delete')
    expect(row.after).toBeNull()
  })

  it('is idempotent on the client-supplied reversalEntryId — a retry does not double-correct or double-log', async () => {
    const token = await login('corr-5', 'owner')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    await app.request('/rokar/opening', json({ amount: 1_000_000 }, token), env)
    await app.request('/advances', json({ entryId: 'adv-corr-5', farmerId: 'farmer-corr-5', amount: 40_000 }, token), env)

    const del1 = await app.request('/entries/adv-corr-5/delete', json({ reversalEntryId: 'adv-corr-5-rev' }, token), env)
    expect(del1.status).toBe(201)
    const del2 = await app.request('/entries/adv-corr-5/delete', json({ reversalEntryId: 'adv-corr-5-rev' }, token), env)
    expect(del2.status).toBe(201) // safe no-op, not an error

    const balance = (await (await app.request('/accounts/farmer-corr-5/balance', auth, env)).json()) as { balance: number }
    expect(balance.balance).toBe(0) // not double-reversed into +40,000

    const log = (await (await app.request('/changelog', auth, env)).json()) as { entryId: string; action: string }[]
    expect(log.filter((r) => r.entryId === 'adv-corr-5').length).toBe(1) // logged exactly once
  })

  it('rejects editing/deleting a nonexistent entry with 404', async () => {
    const token = await login('corr-6', 'owner')
    const edit = await app.request(
      '/entries/nope/edit',
      json({ reversalEntryId: 'r', correctedEntryId: 'c', postings: [{ accountId: 'x', amount: 1 }] }, token),
      env,
    )
    expect(edit.status).toBe(404)
    const del = await app.request('/entries/nope/delete', json({ reversalEntryId: 'r' }, token), env)
    expect(del.status).toBe(404)
  })
})
