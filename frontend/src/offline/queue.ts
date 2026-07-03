import { QUEUE_STORE, DISCARDED_STORE, idbGetAll, idbGet, idbPut, idbDelete } from './db'

// The durable safe-write queue (ADR-0031). Only writes that cannot fail a guard
// in a way that misleads a counterparty may queue: a trade (atomic submission,
// ADR-0032), a bardana lend/return, or a non-cash correction. Cash-outs never
// queue — they need a live Rokar balance (ADR-0019) and are blocked offline.
// Each op carries the client entryId as its idempotency key (ADR-0021), so a
// replay on reconnect is a safe no-op that never double-posts.

export type QueueKind = 'trade' | 'bardana-lend' | 'bardana-return' | 'correction'

// pending: awaiting sync (retried on reconnect / sync-now).
// needs-attention: a terminal 4xx rejection — parked for the user to fix & retry
// or discard with a reason (#61). Never retried automatically, never dropped.
export type QueueStatus = 'pending' | 'needs-attention'

export interface QueuedOp {
  seq?: number // autoIncrement primary key = FIFO order (assigned by IndexedDB)
  id: string // the client entryId — idempotency key + dedupe key
  kind: QueueKind
  payload: unknown // the exact arguments for the matching api call on replay
  summary: string // a short human label for the pending list ("Trade · Ali")
  createdAt: number
  status: QueueStatus
  attempts: number
  lastError?: string
}

export interface DiscardedOp extends QueuedOp {
  reason: string
  discardedAt: number
}

/** The fields a caller supplies; status/attempts are managed here. */
export type NewOp = Omit<QueuedOp, 'seq' | 'status' | 'attempts' | 'lastError'>

/** Enqueue a safe write. Idempotent on `id`: re-enqueuing the same entryId is a no-op. */
export async function enqueue(op: NewOp): Promise<void> {
  const existing = await idbGetAll<QueuedOp>(QUEUE_STORE)
  if (existing.some((o) => o.id === op.id)) return
  await idbPut(QUEUE_STORE, { ...op, status: 'pending', attempts: 0 })
}

/** All queued ops (pending + needs-attention) in FIFO order. */
export async function listQueued(): Promise<QueuedOp[]> {
  const ops = await idbGetAll<QueuedOp>(QUEUE_STORE)
  return ops.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

export async function listPending(): Promise<QueuedOp[]> {
  return (await listQueued()).filter((o) => o.status === 'pending')
}

export async function listNeedsAttention(): Promise<QueuedOp[]> {
  return (await listQueued()).filter((o) => o.status === 'needs-attention')
}

/** Count of items still awaiting sync (excludes needs-attention). */
export async function pendingCount(): Promise<number> {
  return (await listPending()).length
}

export async function needsAttentionCount(): Promise<number> {
  return (await listNeedsAttention()).length
}

/** Remove one op once it has synced. */
export function dequeue(seq: number): Promise<void> {
  return idbDelete(QUEUE_STORE, seq).then(() => undefined)
}

async function patchOp(seq: number, patch: Partial<QueuedOp>): Promise<void> {
  const op = await idbGet<QueuedOp>(QUEUE_STORE, seq)
  if (!op) return
  await idbPut(QUEUE_STORE, { ...op, ...patch })
}

/** Park a terminally-rejected op for the user to resolve (#61). */
export function markNeedsAttention(seq: number, error: string): Promise<void> {
  return patchOp(seq, { status: 'needs-attention', lastError: error })
}

/** Count one more sync attempt against an op (kept pending). */
export function recordAttempt(seq: number, error: string): Promise<void> {
  return patchOp(seq, { lastError: error })
}

/** Send a needs-attention item back to the pending queue after the user fixed the cause. */
export function retryOp(seq: number): Promise<void> {
  return patchOp(seq, { status: 'pending', lastError: undefined })
}

/**
 * Discard an op the user chose not to sync — moved to the durable `discarded`
 * store with a recorded reason (ADR-0031: never silently lost), then removed
 * from the active queue.
 */
export async function discardOp(seq: number, reason: string, discardedAt: number): Promise<void> {
  const op = await idbGet<QueuedOp>(QUEUE_STORE, seq)
  if (!op) return
  await idbPut(DISCARDED_STORE, { ...op, reason, discardedAt })
  await dequeue(seq)
}

export function listDiscarded(): Promise<DiscardedOp[]> {
  return idbGetAll<DiscardedOp>(DISCARDED_STORE)
}
