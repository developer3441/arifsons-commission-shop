import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { MoneyLabel } from '../money'

// Dashboard quick action → Issue Advance (Peshi). The backend route
// (POST /advances) already exists (round 1 domain + round 2 persistence); this
// is its first screen.
export function IssueAdvance() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [farmerId, setFarmerId] = useState(searchParams.get('farmerId') ?? '')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [newBalance, setNewBalance] = useState<number | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const entryId = `advance-${farmerId}-${Date.now()}`
      await api.issueAdvance(entryId, farmerId, Number(amount))
      const contact = await api.getContact(farmerId)
      setNewBalance(contact.balance)
      setDone(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('Insufficient cash')) {
        setError('Not enough cash in Rokar to cover this advance — Rokar can never go negative.')
      } else {
        setError('Could not post the advance. Check the farmer id and amount.')
      }
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
        <div role="status">
          <p style={{ color: '#1e7a34' }}>Advance posted.</p>
          {newBalance !== null && (
            <p>
              {farmerId}'s balance is now: <MoneyLabel kind="zamindar" balance={newBalance} />
            </p>
          )}
          <button onClick={() => navigate('/')}>Back to Dashboard</button>
        </div>
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
