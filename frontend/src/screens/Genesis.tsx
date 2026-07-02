import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type GenesisBalance } from '../api'

// Issue #19 — Genesis: one-time opening-balance import (ADR-0022). Owner-only
// onboarding: opening Rokar cash plus any pre-existing farmer/buyer/
// contractor balances, posted as a single genesis entry so the Dashboard
// reconciles to zero drift from day one. Bardana bags already lent out fold
// into the farmer's balance (subtract the bag value before entering it) —
// there's no separate bags-out field yet (issue #21 adds structured
// tracking); Godown stock import is deferred to issue #28/#29 for the same
// reason (no persisted Godown state exists yet).

type Row = GenesisBalance & { key: number }

function BalanceRows({
  title,
  hint,
  rows,
  onChange,
}: {
  title: string
  hint: string
  rows: Row[]
  onChange: (rows: Row[]) => void
}) {
  let nextKey = rows.length ? Math.max(...rows.map((r) => r.key)) + 1 : 0

  function addRow() {
    onChange([...rows, { key: nextKey++, id: '', name: '', balance: 0 }])
  }
  function updateRow(key: number, patch: Partial<Row>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function removeRow(key: number) {
    onChange(rows.filter((r) => r.key !== key))
  }

  return (
    <fieldset style={{ margin: '1rem 0', border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
      <legend>{title}</legend>
      <p style={{ color: '#666', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>{hint}</p>
      {rows.map((row) => (
        <div key={row.key} style={{ display: 'flex', gap: '0.5rem', margin: '0.4rem 0', alignItems: 'center' }}>
          <input
            placeholder="Id"
            value={row.id}
            onChange={(e) => updateRow(row.key, { id: e.target.value })}
            style={{ flex: 1 }}
          />
          <input
            placeholder="Name (optional)"
            value={row.name ?? ''}
            onChange={(e) => updateRow(row.key, { name: e.target.value })}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            placeholder="Balance"
            value={row.balance}
            onChange={(e) => updateRow(row.key, { balance: Number(e.target.value) })}
            style={{ width: 120 }}
          />
          <button type="button" onClick={() => removeRow(row.key)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow}>
        + Add
      </button>
    </fieldset>
  )
}

export function Genesis() {
  const navigate = useNavigate()
  const [rokarOpening, setRokarOpening] = useState('0')
  const [farmerRows, setFarmerRows] = useState<Row[]>([])
  const [buyerRows, setBuyerRows] = useState<Row[]>([])
  const [contractorRows, setContractorRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.postGenesis({
        rokarOpening: Number(rokarOpening),
        farmerBalances: farmerRows.filter((r) => r.id).map(({ id, name, balance }) => ({ id, name, balance })),
        buyerBalances: buyerRows.filter((r) => r.id).map(({ id, name, balance }) => ({ id, name, balance })),
        contractorBalances: contractorRows.filter((r) => r.id).map(({ id, name, balance }) => ({ id, name, balance })),
      })
      setDone(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('409')) {
        setError('Genesis has already been run for this shop. Correct a mistake with an adjusting entry (e.g. an advance or cash action), not by rewriting genesis.')
      } else if (message.includes('400')) {
        setError('Enter at least one non-zero opening balance.')
      } else {
        setError('Could not post the genesis entry.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Genesis — Import Opening Balances</h1>
      <p style={{ color: '#666' }}>
        One-time only. Enter the shop's real starting position — opening cash, and any pre-existing
        farmer, buyer, and contractor balances — and it posts as a single dated entry. Farmer balances
        are signed: negative means the farmer owes the shop (e.g. an outstanding Peshi advance), positive
        means the shop owes the farmer. Buyer balances are typically negative (they owe on a won lot).
        Contractor balances are typically positive (wages owed).
      </p>

      {done ? (
        <p role="status" style={{ color: '#1e7a34' }}>
          Genesis posted.{' '}
          <button onClick={() => navigate('/')} style={{ marginLeft: '0.5rem' }}>
            Back to Dashboard
          </button>
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Opening Rokar cash (PKR)
            <input
              type="number"
              value={rokarOpening}
              onChange={(e) => setRokarOpening(e.target.value)}
              disabled={busy}
              style={{ display: 'block', width: 200 }}
            />
          </label>

          <BalanceRows
            title="Farmers (Zamindar)"
            hint="Negative = farmer owes the shop. Positive = shop owes the farmer."
            rows={farmerRows}
            onChange={setFarmerRows}
          />
          <BalanceRows
            title="Buyers (Pakka)"
            hint="Negative = buyer owes on a won lot."
            rows={buyerRows}
            onChange={setBuyerRows}
          />
          <BalanceRows
            title="Contractors (Thekedar)"
            hint="Positive = wages owed to the contractor."
            rows={contractorRows}
            onChange={setContractorRows}
          />

          <button type="submit" disabled={busy} style={{ marginTop: '0.5rem' }}>
            {busy ? 'Posting…' : 'Post genesis entry'}
          </button>
          {error && (
            <p role="alert" style={{ color: 'crimson' }}>
              {error}
            </p>
          )}
        </form>
      )}
    </main>
  )
}
