import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type BardanaLoan } from '../api'
import { formatPkr } from '../money'

// Issue #21 — Bardana tracker: lend/return empty bags to a farmer. Bags-out
// is a farmer receivable that counts toward True Shop Value (ADR-0010) via
// the farmer's own ledger balance — see routes/bardana.ts for why this
// screen's numbers aren't a second, separate asset line.
export function Bardana() {
  const [loans, setLoans] = useState<BardanaLoan[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [lendFarmerId, setLendFarmerId] = useState('')
  const [lendBags, setLendBags] = useState('')
  const [lendBagValue, setLendBagValue] = useState('')
  const [lendBusy, setLendBusy] = useState(false)
  const [lendError, setLendError] = useState<string | null>(null)

  const [returnFarmerId, setReturnFarmerId] = useState('')
  const [returnBags, setReturnBags] = useState('')
  const [returnBusy, setReturnBusy] = useState(false)
  const [returnError, setReturnError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    api
      .listBardanaLoans()
      .then(setLoans)
      .catch(() => setError('Could not load outstanding bardana loans.'))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function onLend(e: FormEvent) {
    e.preventDefault()
    setLendError(null)
    setLendBusy(true)
    try {
      const entryId = `bardana-lend-${lendFarmerId}-${Date.now()}`
      await api.lendBardana(entryId, lendFarmerId, Number(lendBags), lendBagValue ? Number(lendBagValue) : undefined)
      setLendFarmerId('')
      setLendBags('')
      setLendBagValue('')
      reload()
    } catch {
      setLendError('Could not lend bags. Check the farmer id and bag count.')
    } finally {
      setLendBusy(false)
    }
  }

  async function onReturn(e: FormEvent) {
    e.preventDefault()
    setReturnError(null)
    setReturnBusy(true)
    try {
      const entryId = `bardana-return-${returnFarmerId}-${Date.now()}`
      await api.returnBardana(entryId, returnFarmerId, Number(returnBags))
      setReturnFarmerId('')
      setReturnBags('')
      reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('404')) {
        setReturnError('This farmer has no outstanding bardana loan.')
      } else if (message.includes('400')) {
        setReturnError('Cannot return more bags than are outstanding.')
      } else {
        setReturnError('Could not record the return.')
      }
    } finally {
      setReturnBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Bardana Tracker</h1>
      <p style={{ color: '#666' }}>
        Empty bags lent to farmers pre-season. Lending debits the farmer (an asset — they owe the bag
        value back); returning bags credits them back.
      </p>

      <fieldset style={{ margin: '1rem 0', border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
        <legend>Lend bags</legend>
        <form onSubmit={onLend} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            Farmer id
            <input value={lendFarmerId} onChange={(e) => setLendFarmerId(e.target.value)} disabled={lendBusy} required style={{ display: 'block' }} />
          </label>
          <label>
            Bags
            <input type="number" min={1} value={lendBags} onChange={(e) => setLendBags(e.target.value)} disabled={lendBusy} required style={{ display: 'block', width: 100 }} />
          </label>
          <label>
            Bag value (optional — shop default if blank)
            <input type="number" value={lendBagValue} onChange={(e) => setLendBagValue(e.target.value)} disabled={lendBusy} style={{ display: 'block', width: 160 }} />
          </label>
          <button type="submit" disabled={lendBusy || !lendFarmerId || !lendBags}>
            {lendBusy ? 'Lending…' : 'Lend'}
          </button>
        </form>
        {lendError && (
          <p role="alert" style={{ color: 'crimson' }}>
            {lendError}
          </p>
        )}
      </fieldset>

      <fieldset style={{ margin: '1rem 0', border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
        <legend>Return bags</legend>
        <form onSubmit={onReturn} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            Farmer id
            <input value={returnFarmerId} onChange={(e) => setReturnFarmerId(e.target.value)} disabled={returnBusy} required style={{ display: 'block' }} />
          </label>
          <label>
            Bags
            <input type="number" min={1} value={returnBags} onChange={(e) => setReturnBags(e.target.value)} disabled={returnBusy} required style={{ display: 'block', width: 100 }} />
          </label>
          <button type="submit" disabled={returnBusy || !returnFarmerId || !returnBags}>
            {returnBusy ? 'Recording…' : 'Return'}
          </button>
        </form>
        {returnError && (
          <p role="alert" style={{ color: 'crimson' }}>
            {returnError}
          </p>
        )}
      </fieldset>

      <h2 style={{ fontSize: '1rem', color: '#666' }}>Outstanding bags per farmer</h2>
      {loading && <p>Loading…</p>}
      {!loading && error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
      {!loading && !error && loans && loans.length === 0 && <p>No bardana currently outstanding.</p>}
      {!loading && !error && loans && loans.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>Farmer</th>
              <th>Bags out</th>
              <th>Bag value</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.farmerId} style={{ borderBottom: '1px solid #eee' }}>
                <td>{l.farmerId}</td>
                <td>{l.bagsOut}</td>
                <td>{formatPkr(l.bagValue)}</td>
                <td>{formatPkr(l.bagsOut * l.bagValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
