import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'

// Dashboard quick action → Issue Advance (Peshi). The backend route
// (POST /advances) already exists (round 1 domain + round 2 persistence); this
// is its first screen.
export function IssueAdvance() {
  const navigate = useNavigate()
  const [farmerId, setFarmerId] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const entryId = `advance-${farmerId}-${Date.now()}`
      await api.issueAdvance(entryId, farmerId, Number(amount))
      setDone(true)
    } catch {
      setError('Could not post the advance. Check the farmer id and amount.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 420, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Issue Advance</h1>
      {done ? (
        <p role="status" style={{ color: '#1e7a34' }}>
          Advance posted.{' '}
          <button onClick={() => navigate('/')} style={{ marginLeft: '0.5rem' }}>
            Back to Dashboard
          </button>
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Farmer id
            <input
              style={{ display: 'block', width: '100%' }}
              value={farmerId}
              onChange={(e) => setFarmerId(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Amount (PKR)
            <input
              type="number"
              min={1}
              style={{ display: 'block', width: '100%' }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <button type="submit" disabled={busy || !farmerId || !amount}>
            {busy ? 'Posting…' : 'Post advance'}
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
