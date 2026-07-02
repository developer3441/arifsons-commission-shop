import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #22 — Lot registration & weighing (ADR-0002/0003): the front half of
// the New Trade flow. A lot registers against a farmer with a sequential
// number; bags are weighed in one at a time; payable maunds derive from the
// canonical weight pipeline (gross -> Katt -> maunds).

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

describe('Lots API', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/lots', {}, env)
    expect(res.status).toBe(401)
  })

  it('registers a lot against a farmer with a sequential number', async () => {
    const token = await login('lot-1')
    const first = await app.request('/lots', json({ farmerId: 'farmer-lot-1' }, token), env)
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as { lotNumber: number; farmerId: string }
    expect(firstBody.farmerId).toBe('farmer-lot-1')

    const second = await app.request('/lots', json({ farmerId: 'farmer-lot-1' }, token), env)
    const secondBody = (await second.json()) as { lotNumber: number }
    expect(secondBody.lotNumber).toBe(firstBody.lotNumber + 1) // sequential
  })

  it('weighs bags and derives payable maunds via the shop default Katt', async () => {
    const token = await login('lot-2')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    // shop default Katt is 1.5 kg/bag (see ConfigRepository's DEFAULT_SHOP_CONFIG)
    const create = await app.request('/lots', json({ farmerId: 'farmer-lot-2' }, token), env)
    const { lotNumber } = (await create.json()) as { lotNumber: number }

    // 40 bags at 101.5kg gross -> payable 100kg each -> 4000kg total -> 100 maund
    for (let i = 0; i < 40; i++) {
      const res = await app.request('/lots/' + lotNumber + '/bags', json({ grossKg: 101.5 }, token), env)
      expect(res.status).toBe(201)
    }

    const read = await app.request('/lots/' + lotNumber, auth, env)
    const lot = (await read.json()) as { bags: { grossKg: number; payableKg: number }[]; payableMaunds: number; kattKgPerBag: number }
    expect(lot.bags).toHaveLength(40)
    expect(lot.kattKgPerBag).toBe(1.5)
    expect(lot.payableMaunds).toBe(100)
  })

  it('a light/wet bag clamps payable at zero but still counts toward the bag total', async () => {
    const token = await login('lot-3')
    const auth = { headers: { authorization: `Bearer ${token}` } }
    const create = await app.request('/lots', json({ farmerId: 'farmer-lot-3' }, token), env)
    const { lotNumber } = (await create.json()) as { lotNumber: number }

    // gross 1kg, Katt 1.5kg/bag -> would-be-negative payable clamps at 0
    await app.request('/lots/' + lotNumber + '/bags', json({ grossKg: 1 }, token), env)
    await app.request('/lots/' + lotNumber + '/bags', json({ grossKg: 41.5 }, token), env) // exactly 40kg payable = 1 maund

    const read = await app.request('/lots/' + lotNumber, auth, env)
    const lot = (await read.json()) as { bags: { grossKg: number; payableKg: number }[]; payableMaunds: number }
    expect(lot.bags).toHaveLength(2) // the light bag still counts toward the bag total
    expect(lot.bags[0]!.payableKg).toBe(0) // clamped, not negative
    expect(lot.payableMaunds).toBe(1) // only the second bag contributes payable weight
  })

  it('a farmer with a per-customer Katt override sees it applied at weighing time', async () => {
    const token = await login('lot-4')
    const auth = { headers: { authorization: `Bearer ${token}` } }

    await app.request('/contacts', json({ id: 'farmer-lot-4', kind: 'zamindar', kattKgPerBag: 2 }, token), env)
    const create = await app.request('/lots', json({ farmerId: 'farmer-lot-4' }, token), env)
    const { lotNumber } = (await create.json()) as { lotNumber: number }
    await app.request('/lots/' + lotNumber + '/bags', json({ grossKg: 42 }, token), env)

    const read = await app.request('/lots/' + lotNumber, auth, env)
    const lot = (await read.json()) as { kattKgPerBag: number; payableMaunds: number }
    expect(lot.kattKgPerBag).toBe(2) // the farmer's override, not the shop default of 1.5
    expect(lot.payableMaunds).toBe(1) // (42 - 2) / 40 = 1
  })

  it('lists lots for a farmer, newest first', async () => {
    const token = await login('lot-5')
    const auth = { headers: { authorization: `Bearer ${token}` } }
    const a = await app.request('/lots', json({ farmerId: 'farmer-lot-5' }, token), env)
    const b = await app.request('/lots', json({ farmerId: 'farmer-lot-5' }, token), env)
    const { lotNumber: lotA } = (await a.json()) as { lotNumber: number }
    const { lotNumber: lotB } = (await b.json()) as { lotNumber: number }

    const list = await app.request('/lots?farmerId=farmer-lot-5', auth, env)
    const lots = (await list.json()) as { lotNumber: number }[]
    expect(lots.map((l) => l.lotNumber)).toEqual([lotB, lotA])
  })

  it('rejects weighing a bag into a lot that does not exist', async () => {
    const token = await login('lot-6')
    const res = await app.request('/lots/999999/bags', json({ grossKg: 50 }, token), env)
    expect(res.status).toBe(404)
  })
})
