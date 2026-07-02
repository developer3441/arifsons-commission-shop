import { useEffect, useState } from 'react'
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

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .getGodown()
      .then(setSummary)
      .catch(() => setError('Could not load the Godown.'))
      .finally(() => setLoading(false))
  }, [])

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
    </main>
  )
}
