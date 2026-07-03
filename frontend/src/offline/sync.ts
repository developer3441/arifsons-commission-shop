import { api } from '../api'
import { listPending, listNeedsAttention, dequeue, markNeedsAttention, recordAttempt, type QueuedOp } from './queue'

// Replays one queued safe write against the server. Every op carries the client
// entryId as its idempotency key (ADR-0021), so replaying an op the server
// already saw is a no-op that returns the original result — never a double-post.
async function dispatch(op: QueuedOp): Promise<void> {
  const p = op.payload as Record<string, unknown>
  switch (op.kind) {
    case 'trade':
      await api.submitTrade(p as Parameters<typeof api.submitTrade>[0])
      break
    case 'bardana-lend':
      await api.lendBardana(p.entryId as string, p.farmerId as string, p.bags as number, p.bagValue as number | undefined)
      break
    case 'bardana-return':
      await api.returnBardana(p.entryId as string, p.farmerId as string, p.bags as number)
      break
    case 'correction':
      if (p.action === 'edit') {
        await api.editEntry(
          p.entryId as string,
          p.reversalEntryId as string,
          p.correctedEntryId as string,
          p.postings as { accountId: string; amount: number }[],
        )
      } else {
        await api.deleteEntry(p.entryId as string, p.reversalEntryId as string)
      }
      break
  }
}

// Two-class failure handling (ADR-0031):
//  - transient: offline / network error / 5xx / an expired-token 401 (the 24h
//    token of ADR-0025 will 401 a phone left offline overnight) → retry later.
//    A 401 additionally needs a fresh login before the queue can resume.
//  - terminal: a genuine 4xx validation rejection → park for the user (never
//    retried forever, never dropped).
export type FailureClass = 'transient' | 'auth' | 'terminal'

function statusOf(err: unknown): number | undefined {
  const m = /^(\d{3})\b/.exec(err instanceof Error ? err.message : String(err))
  return m ? Number(m[1]) : undefined
}

export function classify(err: unknown): FailureClass {
  const status = statusOf(err)
  if (status === undefined) return 'transient' // network / offline — no HTTP status
  if (status === 401) return 'auth' // expired token — re-login then resume
  if (status >= 500) return 'transient'
  if (status >= 400) return 'terminal' // genuine validation rejection
  return 'transient'
}

export interface SyncOutcome {
  synced: number
  remaining: number // still pending (transient / not yet reached)
  needsAttention: number
  authRequired: boolean // a 401 halted the flush; caller must prompt re-login
}

/**
 * Flush the pending queue FIFO. Each op replays and is dequeued on success. On a
 * transient failure we stop (the rest stay pending, retried on reconnect / a
 * backoff tick / "sync now"). On an auth (401) we stop and flag authRequired. A
 * terminal 4xx moves the op to the needs-attention list and we continue with the
 * rest — nothing is silently lost.
 */
export async function syncQueue(): Promise<SyncOutcome> {
  const ops = await listPending()
  let synced = 0
  let authRequired = false
  for (const op of ops) {
    try {
      await dispatch(op)
      await dequeue(op.seq!)
      synced++
    } catch (err) {
      const cls = classify(err)
      const message = err instanceof Error ? err.message : String(err)
      if (cls === 'auth') {
        await recordAttempt(op.seq!, message)
        authRequired = true
        break
      }
      if (cls === 'transient') {
        await recordAttempt(op.seq!, message)
        break
      }
      // terminal: park it and keep flushing the rest.
      await markNeedsAttention(op.seq!, message)
    }
  }
  return {
    synced,
    remaining: (await listPending()).length,
    needsAttention: (await listNeedsAttention()).length,
    authRequired,
  }
}
