import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type GodownSummary } from '../api'
import { formatPkr } from '../money'

// Issue #28 — the Godown/Mal Khata view: bag count, net kg, and running
// average cost/kg (ADR-0005). Stock enters here as a side effect of a
// house-buyer trade (New Trade, buyer id = "house") — this screen is read
// -only; a later resale (issue #29) will draw it back down.
export function Godown() {
  const [summary, setSummary] = useState<GodownSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [buyerId, setBuyerId] = useState('')
  const [bagsSold, setBagsSold] = useState('')
  const [netKgSold, setNetKgSold] = useState('')
  const [saleProceeds, setSaleProceeds] = useState('')
  const [resaleBusy, setResaleBusy] = useState(false)
  const [resaleError, setResaleError] = useState<string | null>(null)
  const [resaleResult, setResaleResult] = useState<{ costOfGoodsSold: number; tradingPnL: number } | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    api
      .getGodown()
      .then(setSummary)
      .catch(() => setError('Could not load the Godown.'))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function onResale(e: FormEvent) {
    e.preventDefault()
    setResaleError(null)
    setResaleResult(null)
    setResaleBusy(true)
    try {
      const entryId = `resale-${buyerId}-${Date.now()}`
      const posted = await api.resellStock(entryId, buyerId, Number(bagsSold), Number(netKgSold), Number(saleProceeds))
      setResaleResult({ costOfGoodsSold: posted.costOfGoodsSold, tradingPnL: posted.tradingPnL })
      setBuyerId('')
      setBagsSold('')
      setNetKgSold('')
      setSaleProceeds('')
      reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setResaleError(
        message.includes('400')
          ? 'Cannot sell more stock (bags or net kg) than the Godown holds.'
          : 'Could not record the resale. Check the buyer id and amounts.',
      )
    } finally {
      setResaleBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Godown</h1>
      <p style={{ color: '#666' }}>
        Own-trading stock bought as the internal house buyer (ADR-0005), valued at running average cost —
        to buy stock in, start a New Trade and sell the lot to buyer id <code>house</code>.
      </p>

      {loading && <p>Loading…</p>}
      {!loading && error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
      {!loading && !error && summary && (
        <>
          {summary.bags === 0 ? (
            <p>No stock currently held in the Godown.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem 0', color: '#666' }}>Bags</td>
                  <td style={{ padding: '0.4rem 0', fontWeight: 600 }}>{summary.bags}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem 0', color: '#666' }}>Net kg</td>
                  <td style={{ padding: '0.4rem 0', fontWeight: 600 }}>{summary.netKg.toLocaleString('en-PK')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem 0', color: '#666' }}>Total cost basis</td>
                  <td style={{ padding: '0.4rem 0', fontWeight: 600 }}>{formatPkr(summary.totalCostBasis)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.4rem 0', color: '#666' }}>Average cost/kg</td>
                  <td style={{ padding: '0.4rem 0', fontWeight: 600 }}>
                    {formatPkr(Math.round(summary.averageCostPerKg))}/kg
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      )}

      {!loading && !error && summary && summary.bags > 0 && (
        <fieldset style={{ marginTop: '1.5rem', border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
          <legend>Sell stock to a buyer (resale)</legend>
          <p style={{ color: '#666', fontSize: '0.85rem' }}>
            COGS is charged at the running average cost/kg; the difference from the sale proceeds books to
            revenue as trading profit — reported separately from commission (ADR-0005).
          </p>
          <form onSubmit={onResale} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label>
              Buyer id
              <input value={buyerId} onChange={(e) => setBuyerId(e.target.value)} disabled={resaleBusy} required style={{ display: 'block' }} />
            </label>
            <label>
              Bags sold
              <input
                type="number"
                min={1}
                max={summary.bags}
                value={bagsSold}
                onChange={(e) => setBagsSold(e.target.value)}
                disabled={resaleBusy}
                required
                style={{ display: 'block', width: 100 }}
              />
            </label>
            <label>
              Net kg sold
              <input
                type="number"
                min={1}
                max={summary.netKg}
                step="0.1"
                value={netKgSold}
                onChange={(e) => setNetKgSold(e.target.value)}
                disabled={resaleBusy}
                required
                style={{ display: 'block', width: 120 }}
              />
            </label>
            <label>
              Sale proceeds (PKR)
              <input
                type="number"
                min={1}
                value={saleProceeds}
                onChange={(e) => setSaleProceeds(e.target.value)}
                disabled={resaleBusy}
                required
                style={{ display: 'block', width: 160 }}
              />
            </label>
            <button type="submit" disabled={resaleBusy || !buyerId || !bagsSold || !netKgSold || !saleProceeds}>
              {resaleBusy ? 'Recording…' : 'Record resale'}
            </button>
          </form>
          {resaleError && (
            <p role="alert" style={{ color: 'crimson' }}>
              {resaleError}
            </p>
          )}
          {resaleResult && (
            <p role="status" style={{ color: '#1e7a34' }}>
              Resale posted — COGS {formatPkr(resaleResult.costOfGoodsSold)}, trading P&amp;L{' '}
              {formatPkr(resaleResult.tradingPnL)}.
            </p>
          )}
        </fieldset>
      )}
    </main>
  )
}
