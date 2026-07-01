import { useState } from 'react'
import { api, type Balance } from './api'

// Walking-skeleton UI: drive the whole Peshi-advance flow through the API and
// read both ledger balances back. Deliberately bare — issue #12 is the real
// dashboard; this only proves the frontend → API → engine → D1 path.
export function App() {
  const [farmerId, setFarmerId] = useState('farmer-ali')
  const [opening, setOpening] = useState(1_000_000)
  const [advance, setAdvance] = useState(200_000)
  const [farmerBal, setFarmerBal] = useState<Balance | null>(null)
  const [rokarBal, setRokarBal] = useState<Balance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setError(null)
    setBusy(true)
    try {
      await api.createFarmer(farmerId)
      await api.setOpeningCash(opening)
      await api.issueAdvance(`adv-${Date.now()}`, farmerId, advance)
      setFarmerBal(await api.balanceOf(farmerId))
      setRokarBal(await api.balanceOf('rokar'))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 520, margin: '2rem auto' }}>
      <h1>SplitEase — Peshi advance</h1>

      <label style={{ display: 'block', margin: '0.5rem 0' }}>
        Farmer id{' '}
        <input value={farmerId} onChange={(e) => setFarmerId(e.target.value)} />
      </label>
      <label style={{ display: 'block', margin: '0.5rem 0' }}>
        Opening cash (PKR){' '}
        <input
          type="number"
          value={opening}
          onChange={(e) => setOpening(Number(e.target.value))}
        />
      </label>
      <label style={{ display: 'block', margin: '0.5rem 0' }}>
        Advance (PKR){' '}
        <input
          type="number"
          value={advance}
          onChange={(e) => setAdvance(Number(e.target.value))}
        />
      </label>

      <button onClick={run} disabled={busy}>
        {busy ? 'Working…' : 'Issue advance'}
      </button>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <ul>
        <li>
          Farmer ({farmerId}): {farmerBal ? `PKR ${farmerBal.balance.toLocaleString()}` : '—'}
        </li>
        <li>Rokar (cash): {rokarBal ? `PKR ${rokarBal.balance.toLocaleString()}` : '—'}</li>
      </ul>
    </main>
  )
}
