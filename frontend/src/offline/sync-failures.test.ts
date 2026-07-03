import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { classify, syncQueue } from './sync'
import { enqueue, listPending, listNeedsAttention, listDiscarded, retryOp, discardOp, type NewOp } from './queue'
import { api } from '../api'

// Issue #61 — two-class sync failure handling (ADR-0031): transient failures
// (network / 5xx / 401) retry and never drop; a terminal 4xx parks the item on
// the needs-attention list to retry-after-fix or discard-with-reason.

vi.mock('../api', () => ({ api: { submitTrade: vi.fn() } }))

// A mock implementation that throws an HTTP-status error *synchronously*: the
// `await api.xxx()` in dispatch rejects directly, with no standalone rejected
// promise floating around (which vitest would flag as unhandled).
const rejecting = (message: string) => () => {
  throw new Error(message)
}

const op = (id: string): NewOp => ({
  id,
  kind: 'trade',
  payload: { entryId: id },
  summary: `Trade · ${id}`,
  createdAt: 1,
})

const firstSeq = async () => (await listPending())[0]!.seq!

// Clear the throwing implementation before the shared teardown so a stale mock
// can't surface its (already-handled) error during afterEach.
afterEach(() => vi.mocked(api.submitTrade).mockReset())

describe('classify (ADR-0031/0025)', () => {
  it('maps errors to transient / auth / terminal', () => {
    expect(classify(new TypeError('Failed to fetch'))).toBe('transient') // offline, no status
    expect(classify(new Error('500: boom'))).toBe('transient')
    expect(classify(new Error('503: unavailable'))).toBe('transient')
    expect(classify(new Error('401: token expired'))).toBe('auth')
    expect(classify(new Error('400: bad'))).toBe('terminal')
    expect(classify(new Error('409: conflict'))).toBe('terminal')
  })
})

describe('syncQueue failure handling', () => {
  beforeEach(() => vi.mocked(api.submitTrade).mockReset())

  it('leaves a transiently-failed op pending for retry (never dropped)', async () => {
    await enqueue(op('t-transient'))
    vi.mocked(api.submitTrade).mockImplementation(rejecting('503: unavailable'))

    const out = await syncQueue()
    const pending = await listPending()
    const attention = await listNeedsAttention()
    expect(out).toMatchObject({ synced: 0, remaining: 1, needsAttention: 0, authRequired: false })
    expect(pending).toHaveLength(1) // still queued
    expect(attention).toHaveLength(0)
  })

  it('flags authRequired on a 401 and keeps the op pending (resumes after re-login)', async () => {
    await enqueue(op('t-auth'))
    vi.mocked(api.submitTrade).mockImplementation(rejecting('401: token expired'))

    const out = await syncQueue()
    const pending = await listPending()
    const attention = await listNeedsAttention()
    expect(out.authRequired).toBe(true)
    expect(pending).toHaveLength(1)
    expect(attention).toHaveLength(0)
  })

  it('moves a terminal 4xx to needs-attention and never retries it automatically', async () => {
    await enqueue(op('t-terminal'))
    vi.mocked(api.submitTrade).mockImplementation(rejecting('400: oversell'))

    const out = await syncQueue()
    const attention = await listNeedsAttention()
    expect(out).toMatchObject({ synced: 0, remaining: 0, needsAttention: 1 })
    expect(attention).toHaveLength(1)
    expect(attention[0]!.lastError).toMatch(/oversell/)

    // A second flush ignores needs-attention items — no further dispatch.
    vi.mocked(api.submitTrade).mockClear()
    await syncQueue()
    expect(vi.mocked(api.submitTrade)).not.toHaveBeenCalled()
  })
})

describe('needs-attention resolution (#61)', () => {
  it('retry sends a parked item back to pending', async () => {
    await enqueue(op('t-retry'))
    vi.mocked(api.submitTrade).mockImplementation(rejecting('422: invalid'))
    await syncQueue()
    const seq = (await listNeedsAttention())[0]!.seq!

    await retryOp(seq)
    expect(await listNeedsAttention()).toHaveLength(0)
    expect(await listPending()).toHaveLength(1)
  })

  it('discard removes the item from the queue and records it with a reason (never silently lost)', async () => {
    await enqueue(op('t-discard'))
    const seq = await firstSeq()

    await discardOp(seq, 'entered wrong buyer', 123)
    expect(await listPending()).toHaveLength(0)
    const discarded = await listDiscarded()
    expect(discarded).toHaveLength(1)
    expect(discarded[0]!.reason).toBe('entered wrong buyer')
    expect(discarded[0]!.id).toBe('t-discard')
  })
})
