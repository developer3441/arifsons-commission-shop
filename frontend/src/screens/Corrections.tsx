import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type EntryRecord, type ChangeLogRow } from '../api'
import { formatPkr } from '../money'

// Issue #30 — Corrections & audit log (ADR-0011, clarified; ADR-0021). An
// edit/delete never rewrites a posting: it appends a reversal (and, for an
// edit, a fresh corrected entry) plus a change-log row. Editing a settled
// entry warns and is Owner-only, but the change is still logged either way.

const ENTRY_KIND_LABEL: Record<string, string> = {
  opening_balance: 'Opening balance',
  peshi_advance: 'Advance (Peshi)',
  trade: 'Sale',
  buyer_payment: 'Buyer payment',
  farmer_withdrawal: 'Farmer withdrawal',
  contractor_payout: 'Contractor payout',
  cess_remittance: 'Cess remittance',
  bardana_loan: 'Bardana lent',
  bardana_resolution: 'Bardana resolved',
  stock_resale: 'Godown resale',
}

function summarisePostings(postings: { accountId: string; amount: number }[]): string {
  return postings.map((p) => `${p.accountId}: ${p.amount >= 0 ? '+' : ''}${formatPkr(p.amount)}`).join(', ')
}

export function Corrections() {
  const [log, setLog] = useState<ChangeLogRow[] | null>(null)
  const [logLoading, setLogLoading] = useState(true)
  const [logError, setLogError] = useState<string | null>(null)

  const [entryId, setEntryId] = useState('')
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [postingsDraft, setPostingsDraft] = useState<{ accountId: string; amount: string }[]>([])
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ kind: 'edit' | 'delete'; warning?: string } | null>(null)

  function reloadLog() {
    setLogLoading(true)
    setLogError(null)
    api
      .getChangeLog()
      .then(setLog)
      .catch(() => setLogError('Could not load the change log.'))
      .finally(() => setLogLoading(false))
  }

  useEffect(reloadLog, [])

  async function onLookup(e: FormEvent) {
    e.preventDefault()
    setLookupError(null)
    setActionResult(null)
    setLookupBusy(true)
    try {
      const found = await api.getEntry(entryId)
      setEntry(found)
      setPostingsDraft(found.postings.map((p) => ({ accountId: p.accountId, amount: String(p.amount) })))
    } catch {
      setEntry(null)
      setLookupError('No such entry.')
    } finally {
      setLookupBusy(false)
    }
  }

  async function onEdit(e: FormEvent) {
    e.preventDefault()
    if (!entry) return
    setActionError(null)
    setActionBusy(true)
    try {
      const stamp = Date.now()
      const postings = postingsDraft.map((p) => ({ accountId: p.accountId, amount: Number(p.amount) }))
      const result = await api.editEntry(entry.id, `${entry.id}-rev-${stamp}`, `${entry.id}-corrected-${stamp}`, postings)
      setActionResult({ kind: 'edit', warning: result.warning })
      reloadLog()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setActionError(message.includes('403') ? 'Only an Owner may edit a settled entry.' : 'Could not save this correction.')
    } finally {
      setActionBusy(false)
    }
  }

  async function onDelete() {
    if (!entry) return
    setActionError(null)
    setActionBusy(true)
    try {
      const stamp = Date.now()
      const result = await api.deleteEntry(entry.id, `${entry.id}-rev-${stamp}`)
      setActionResult({ kind: 'delete', warning: result.warning })
      setEntry(null)
      setEntryId('')
      reloadLog()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setActionError(message.includes('403') ? 'Only an Owner may delete a settled entry.' : 'Could not delete this entry.')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Corrections &amp; Audit Log</h1>
      <p style={{ color: '#666' }}>
        An edit or delete never rewrites a posting — it appends a reversal (and, for an edit, a fresh
        corrected entry). Editing a settled entry (cess remitted, contractor paid, buyer cleared) warns and
        is Owner-only; the change is still logged.
      </p>

      <fieldset style={{ margin: '1rem 0', border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
        <legend>Look up an entry to correct</legend>
        <form onSubmit={onLookup} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <label>
            Entry id
            <input value={entryId} onChange={(e) => setEntryId(e.target.value)} disabled={lookupBusy} required style={{ display: 'block' }} />
          </label>
          <button type="submit" disabled={lookupBusy || !entryId}>
            {lookupBusy ? 'Looking up…' : 'Look up'}
          </button>
        </form>
        {lookupError && (
          <p role="alert" style={{ color: 'crimson' }}>
            {lookupError}
          </p>
        )}

        {entry && (
          <form onSubmit={onEdit} style={{ marginTop: '1rem' }}>
            <p>
              <strong>{ENTRY_KIND_LABEL[entry.kind] ?? entry.kind}</strong> ({entry.id})
            </p>
            <table style={{ borderCollapse: 'collapse', marginBottom: '0.75rem' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ paddingRight: '1rem' }}>Account</th>
                  <th>Amount (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {postingsDraft.map((p, i) => (
                  <tr key={p.accountId}>
                    <td style={{ paddingRight: '1rem' }}>{p.accountId}</td>
                    <td>
                      <input
                        type="number"
                        value={p.amount}
                        onChange={(e) => {
                          const next = [...postingsDraft]
                          next[i] = { ...next[i]!, amount: e.target.value }
                          setPostingsDraft(next)
                        }}
                        disabled={actionBusy}
                        style={{ width: 140 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="submit" disabled={actionBusy}>
              {actionBusy ? 'Saving…' : 'Save correction'}
            </button>
            <button type="button" onClick={onDelete} disabled={actionBusy} style={{ marginLeft: '0.5rem', color: '#a53434' }}>
              Delete this entry
            </button>
            {actionError && (
              <p role="alert" style={{ color: 'crimson' }}>
                {actionError}
              </p>
            )}
            {actionResult && (
              <p role="status" style={{ color: actionResult.warning ? '#a53434' : '#1e7a34' }}>
                {actionResult.kind === 'edit' ? 'Correction saved.' : 'Entry deleted.'}
                {actionResult.warning && <> {actionResult.warning}</>}
              </p>
            )}
          </form>
        )}
      </fieldset>

      <h2>Change history</h2>
      {logLoading && <p>Loading…</p>}
      {!logLoading && logError && (
        <p role="alert" style={{ color: 'crimson' }}>
          {logError}
        </p>
      )}
      {!logLoading && !logError && log && log.length === 0 && <p>No corrections have been made yet.</p>}
      {!logLoading && !logError && log && log.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>When</th>
              <th>Entry</th>
              <th>Action</th>
              <th>Before</th>
              <th>After</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {log.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(row.timestamp).toLocaleString()}</td>
                <td>{row.entryId}</td>
                <td>{row.action}</td>
                <td>{summarisePostings(row.before.postings)}</td>
                <td>{row.after ? summarisePostings(row.after.postings) : '(deleted)'}</td>
                <td>{row.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
