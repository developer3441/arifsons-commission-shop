import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #17 — Contacts: create/search/read farmers, buyers, and contractors,
// each optionally carrying per-customer overrides (ADR-0001/0003/0012).

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
})

async function loginAsBookkeeper(id: string): Promise<string> {
  await new UserRepository(env.DB).createUser(id, 'Munshi', `munshi-${id}`, 'password123', 'bookkeeper')
  const res = await app.request('/auth/login', json({ username: `munshi-${id}`, password: 'password123' }), env)
  const { token } = (await res.json()) as { token: string }
  return token
}

describe('Contacts API', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/contacts?kind=zamindar', {}, env)
    expect(res.status).toBe(401)
  })

  it('creates a farmer with per-customer overrides, finds it in search, and reads it back', async () => {
    const token = await loginAsBookkeeper('contacts-1')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    const create = await app.request(
      '/contacts',
      json(
        {
          id: 'farmer-rashid',
          kind: 'zamindar',
          name: 'Rashid Khan',
          commissionRate: 0.03,
          bagBearer: 'buyer',
          labourBearer: 'buyer',
          kattKgPerBag: 2,
        },
        token,
      ),
      env,
    )
    expect(create.status).toBe(201)

    const search = await app.request('/contacts?kind=zamindar&q=rashid', auth, env)
    expect(search.status).toBe(200)
    const results = (await search.json()) as { id: string; name?: string }[]
    expect(results.map((r) => r.id)).toContain('farmer-rashid')

    const read = await app.request('/contacts/farmer-rashid', auth, env)
    expect(read.status).toBe(200)
    const contact = (await read.json()) as {
      id: string
      kind: string
      name?: string
      commissionRate?: number
      bagBearer?: string
      labourBearer?: string
      kattKgPerBag?: number
      balance: number
    }
    expect(contact.kind).toBe('zamindar')
    expect(contact.commissionRate).toBe(0.03)
    expect(contact.bagBearer).toBe('buyer')
    expect(contact.labourBearer).toBe('buyer')
    expect(contact.kattKgPerBag).toBe(2)
    expect(contact.balance).toBe(0) // no trades posted yet — settled
  })

  it('creates a buyer and a contractor with no overrides', async () => {
    const token = await loginAsBookkeeper('contacts-2')

    const buyer = await app.request(
      '/contacts',
      json({ id: 'buyer-alpha-mill', kind: 'pakka', name: 'Alpha Mill' }, token),
      env,
    )
    expect(buyer.status).toBe(201)

    const contractor = await app.request(
      '/contacts',
      json({ id: 'thekedar-saeed', kind: 'thekedar', name: 'Saeed' }, token),
      env,
    )
    expect(contractor.status).toBe(201)

    const buyers = await app.request('/contacts?kind=pakka', { headers: { authorization: `Bearer ${token}` } }, env)
    const buyerIds = ((await buyers.json()) as { id: string }[]).map((c) => c.id)
    expect(buyerIds).toContain('buyer-alpha-mill')

    const contractors = await app.request(
      '/contacts?kind=thekedar',
      { headers: { authorization: `Bearer ${token}` } },
      env,
    )
    const contractorIds = ((await contractors.json()) as { id: string }[]).map((c) => c.id)
    expect(contractorIds).toContain('thekedar-saeed')
  })

  it('round-trips a phone number and finds the contact by phone, id, or name (#53)', async () => {
    const token = await loginAsBookkeeper('contacts-phone')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    const create = await app.request(
      '/contacts',
      json({ id: 'farmer-yusuf', kind: 'zamindar', name: 'Yusuf Ali', phone: '0300-1234567' }, token),
      env,
    )
    expect(create.status).toBe(201)
    expect(((await create.json()) as { phone?: string }).phone).toBe('0300-1234567')

    const read = await app.request('/contacts/farmer-yusuf', auth, env)
    expect(((await read.json()) as { phone?: string }).phone).toBe('0300-1234567')

    // q matches phone (a digit substring), id (the 'farmer-' prefix is unique to
    // the id, not the name/phone), and name — all case-insensitive.
    for (const q of ['1234567', 'FARMER-YUS', 'yusuf ali']) {
      const search = await app.request(`/contacts?kind=zamindar&q=${encodeURIComponent(q)}`, auth, env)
      const ids = ((await search.json()) as { id: string }[]).map((r) => r.id)
      expect(ids, `q=${q}`).toContain('farmer-yusuf')
    }
  })

  it('editing an existing contact updates its overrides in place', async () => {
    const token = await loginAsBookkeeper('contacts-3')
    await app.request('/contacts', json({ id: 'farmer-edit-me', kind: 'zamindar', commissionRate: 0.02 }, token), env)
    await app.request('/contacts', json({ id: 'farmer-edit-me', kind: 'zamindar', commissionRate: 0.07 }, token), env)

    const read = await app.request(
      '/contacts/farmer-edit-me',
      { headers: { authorization: `Bearer ${token}` } },
      env,
    )
    const contact = (await read.json()) as { commissionRate?: number }
    expect(contact.commissionRate).toBe(0.07)
  })
})
