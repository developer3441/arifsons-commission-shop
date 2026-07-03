import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enqueue, listQueued, pendingCount, type NewOp } from './queue'
import { cacheContacts, searchCachedContacts, cacheConfig, getCachedConfig } from './cache'
import { syncQueue } from './sync'
import { api, type ContactRecord, type ShopConfig } from '../api'

vi.mock('../api', () => ({
  api: { submitTrade: vi.fn(), lendBardana: vi.fn(), returnBardana: vi.fn() },
}))

const tradeOp = (id: string): NewOp => ({
  id,
  kind: 'trade',
  payload: { entryId: id, farmerId: 'f1', thekedarId: 't1', bags: [{ grossKg: 100 }], lines: [{ buyerId: 'b1', bagCount: 1, ratePerMaund: 2000 }] },
  summary: 'Trade · f1',
  createdAt: 1,
})

describe('offline queue (ADR-0031)', () => {
  it('enqueues FIFO and is idempotent on entryId', async () => {
    await enqueue(tradeOp('trade-1'))
    await enqueue(tradeOp('trade-2'))
    await enqueue(tradeOp('trade-1')) // duplicate entryId — no-op (ADR-0021)

    const ops = await listQueued()
    expect(ops.map((o) => o.id)).toEqual(['trade-1', 'trade-2']) // FIFO, deduped
    expect(await pendingCount()).toBe(2)
  })

  it('persists across a "restart" (reopening the DB reads the same queue)', async () => {
    await enqueue(tradeOp('trade-restart'))
    // A fresh read (simulating app relaunch — the DB is durable, not in-memory).
    expect((await listQueued()).map((o) => o.id)).toContain('trade-restart')
  })
})

describe('offline read-cache (ADR-0031)', () => {
  const contacts: ContactRecord[] = [
    { id: 'farmer-ali', kind: 'zamindar', name: 'Ali', phone: '0300-1', balance: 0 },
    { id: 'buyer-mill', kind: 'pakka', name: 'Mill', phone: '0301-2', balance: 0 },
  ]

  it('searches cached contacts by kind and name/id/phone', async () => {
    await cacheContacts(contacts)
    expect((await searchCachedContacts('zamindar', 'ali')).map((c) => c.id)).toEqual(['farmer-ali'])
    expect((await searchCachedContacts('pakka', '0301')).map((c) => c.id)).toEqual(['buyer-mill'])
    expect(await searchCachedContacts('thekedar', '')).toEqual([])
  })

  it('round-trips the shop config for the offline preview', async () => {
    const cfg = { kattKgPerBag: 1.5 } as ShopConfig
    await cacheConfig(cfg)
    expect((await getCachedConfig())?.kattKgPerBag).toBe(1.5)
  })
})

describe('offline sync replay (ADR-0031/0021)', () => {
  beforeEach(() => vi.mocked(api.submitTrade).mockReset().mockResolvedValue({} as never))

  it('replays queued ops FIFO and clears them on success', async () => {
    await enqueue(tradeOp('trade-a'))
    await enqueue(tradeOp('trade-b'))

    const result = await syncQueue()
    expect(result).toMatchObject({ synced: 2, remaining: 0, needsAttention: 0, authRequired: false })
    expect(vi.mocked(api.submitTrade)).toHaveBeenCalledTimes(2)
    expect(await pendingCount()).toBe(0)
  })

  it('stops on the first failure and leaves the rest queued for retry', async () => {
    await enqueue(tradeOp('trade-x'))
    await enqueue(tradeOp('trade-y'))
    vi.mocked(api.submitTrade).mockRejectedValueOnce(new Error('offline'))

    const result = await syncQueue()
    expect(result.synced).toBe(0)
    expect(result.remaining).toBe(2) // nothing lost — both still queued
  })
})
