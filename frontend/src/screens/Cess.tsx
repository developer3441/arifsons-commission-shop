import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api'
import { formatPkr } from '../money'

// Issue #25 — Cess / Government: the running cess-held liability (ADR-0004)
// and an Owner-only "remit to government" action, guard-railed against
// negative cash (ADR-0019).
export function Cess() {
  const { user } = useAuth()
  const [held, setHeld] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [remitError, setRemitError] = useState<string | null>(null)
  const [remitted, setRemitted] = useState<number | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    api
      .getCessHeld()
      .then((r) => setHeld(r.held))
      .catch(() => setError('Could not load the cess balance.'))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function onRemit() {
    setRemitError(null)
    setBusy(true)
    try {
      const entryId = `cess-remit-${Date.now()}`
      const res = await api.remitCess(entryId)
      setRemitted(res.amountRemitted)
      reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('Insufficient cash')) {
        setRemitError('Not enough cash in Rokar to remit this cess — Rokar can never go negative.')
      } else if (message.includes('No cess is held')) {
        setRemitError('There is no cess held right now.')
      } else {
        setRemitError('Could not remit cess.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Cess / Government</h1>

      {loading && <p>Loading…</p>}
      {!loading && error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
      {!loading && !error && held !== null && (
        <>
          <div style={{ background: '#f3ecfa', color: '#6a3fa0', borderRadius: 10, padding: '1rem', margin: '1rem 0' }}>
            <div style={{ fontSize: '0.85rem' }}>Cess held for the government</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{formatPkr(held)}</div>
          </div>

          {user?.role === 'owner' ? (
            <>
              <button onClick={onRemit} disabled={busy || held === 0}>
                {busy ? 'Remitting…' : 'Remit to government'}
              </button>
              {remitted !== null && (
                <p role="status" style={{ color: '#1e7a34' }}>
                  Remitted {formatPkr(remitted)}.
                </p>
              )}
              {remitError && (
                <p role="alert" style={{ color: 'crimson' }}>
                  {remitError}
                </p>
              )}
            </>
          ) : (
            <p style={{ color: '#666' }}>Only an Owner can remit cess.</p>
          )}
        </>
      )}
    </main>
  )
}
