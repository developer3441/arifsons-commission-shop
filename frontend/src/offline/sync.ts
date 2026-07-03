import { api } from '../api'
import { listQueued, dequeue, type QueuedOp } from './queue'

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

export interface SyncResult {
  synced: number
  remaining: number
}

/**
 * Flush the queue FIFO (ADR-0031). Each op replays and is dequeued on success.
 * On the first failure we stop and leave the rest queued — they auto-retry on the
 * next reconnect / manual "sync now". The transient-vs-terminal classification and
 * the visible "needs attention" list are the next slice (#61).
 */
export async function syncQueue(): Promise<SyncResult> {
  const ops = await listQueued()
  let synced = 0
  for (const op of ops) {
    try {
      await dispatch(op)
      await dequeue(op.seq!)
      synced++
    } catch {
      break
    }
  }
  const remaining = (await listQueued()).length
  return { synced, remaining }
}
