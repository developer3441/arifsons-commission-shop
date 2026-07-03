import { QUEUE_STORE, idbGetAll, idbPut, idbDelete } from './db'

// The durable safe-write queue (ADR-0031). Only writes that cannot fail a guard
// in a way that misleads a counterparty may queue: a trade (atomic submission,
// ADR-0032), a bardana lend/return, or a non-cash correction. Cash-outs never
// queue — they need a live Rokar balance (ADR-0019) and are blocked offline.
// Each op carries the client entryId as its idempotency key (ADR-0021), so a
// replay on reconnect is a safe no-op that never double-posts.

export type QueueKind = 'trade' | 'bardana-lend' | 'bardana-return' | 'correction'

export interface QueuedOp {
  seq?: number // autoIncrement primary key = FIFO order (assigned by IndexedDB)
  id: string // the client entryId — idempotency key + dedupe key
  kind: QueueKind
  payload: unknown // the exact arguments for the matching api call on replay
  summary: string // a short human label for the pending list ("Trade · Ali")
  createdAt: number
}

/** Enqueue a safe write. Idempotent on `id`: re-enqueuing the same entryId is a no-op. */
export async function enqueue(op: Omit<QueuedOp, 'seq'>): Promise<void> {
  const existing = await idbGetAll<QueuedOp>(QUEUE_STORE)
  if (existing.some((o) => o.id === op.id)) return
  await idbPut(QUEUE_STORE, op)
}

/** All pending ops in FIFO (insertion) order. */
export async function listQueued(): Promise<QueuedOp[]> {
  const ops = await idbGetAll<QueuedOp>(QUEUE_STORE)
  return ops.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

export async function pendingCount(): Promise<number> {
  return (await idbGetAll<QueuedOp>(QUEUE_STORE)).length
}

/** Remove one op once it has synced. */
export function dequeue(seq: number): Promise<void> {
  return idbDelete(QUEUE_STORE, seq).then(() => undefined)
}
