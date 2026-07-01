// Issue #13 — corrections via mutable entries + an append-only change log
// (ADR-0011). An entry can be edited or deleted, but every mutation is
// recorded as a change-log row (entity, before -> after, actor, timestamp)
// that itself can never be edited (frozen at creation). Balances are always
// derived from the CURRENT stream (balanceOf, posting.ts), so an edit or
// delete can never leave a ledger out of sync — recompute simply means
// calling balanceOf again on the returned stream.

import { type Entry } from './posting'

export interface ChangeLogRow {
  readonly id: string
  readonly entryId: string
  readonly action: 'edit' | 'delete'
  readonly before: Entry
  readonly after: Entry | null // null for a delete
  readonly actor: string
  readonly timestamp: string
}

export interface CorrectionResult {
  readonly stream: readonly Entry[] // the new, current stream — recompute balances from this
  readonly logRow: ChangeLogRow
  /** Present when the edited/deleted entry was settled (ADR-0011: warn, don't silently allow). */
  readonly warning?: string
}

function makeLogRow(
  entryId: string,
  action: 'edit' | 'delete',
  before: Entry,
  after: Entry | null,
  actor: string,
  timestamp: string,
): ChangeLogRow {
  // Frozen at creation — the log itself is never editable (ADR-0011).
  return Object.freeze({ id: `changelog-${entryId}-${timestamp}`, entryId, action, before, after, actor, timestamp })
}

function settledWarning(entryId: string, settledEntryIds: readonly string[], verb: string): string | undefined {
  return settledEntryIds.includes(entryId)
    ? `Entry ${entryId} is settled — ${verb} it may affect a closed invoice or completed payout`
    : undefined
}

/**
 * Edit an existing entry in place (by id), replacing it with `updated`.
 * Returns the new stream (recompute balances from it) and an append-only
 * change-log row. If `entryId` is in `settledEntryIds`, a warning is returned
 * rather than blocking — callers decide whether to require confirmation.
 */
export function editEntry(
  stream: readonly Entry[],
  entryId: string,
  updated: Entry,
  actor: string,
  timestamp: string,
  settledEntryIds: readonly string[] = [],
): CorrectionResult {
  const index = stream.findIndex((e) => e.id === entryId)
  if (index === -1) {
    throw new Error(`No entry with id ${entryId} to edit`)
  }
  const before = stream[index]!
  const newStream = stream.slice()
  newStream[index] = updated

  return {
    stream: newStream,
    logRow: makeLogRow(entryId, 'edit', before, updated, actor, timestamp),
    warning: settledWarning(entryId, settledEntryIds, 'editing'),
  }
}

/**
 * Delete an existing entry (by id). Returns the new stream and an
 * append-only change-log row. Same settled-entry warning behaviour as edit.
 */
export function deleteEntry(
  stream: readonly Entry[],
  entryId: string,
  actor: string,
  timestamp: string,
  settledEntryIds: readonly string[] = [],
): CorrectionResult {
  const index = stream.findIndex((e) => e.id === entryId)
  if (index === -1) {
    throw new Error(`No entry with id ${entryId} to delete`)
  }
  const before = stream[index]!
  const newStream = stream.slice(0, index).concat(stream.slice(index + 1))

  return {
    stream: newStream,
    logRow: makeLogRow(entryId, 'delete', before, null, actor, timestamp),
    warning: settledWarning(entryId, settledEntryIds, 'deleting'),
  }
}

/** Append a row to the change log — the log only ever grows; nothing is ever removed or rewritten. */
export function appendToChangeLog(log: readonly ChangeLogRow[], row: ChangeLogRow): readonly ChangeLogRow[] {
  return [...log, row]
}
