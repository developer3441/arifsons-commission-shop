import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type LotDetail } from '../api'

// Issue #22 — Lot registration & weighing: the front half of the New Trade
// flow. Register a lot against a farmer, then weigh bags one at a time,
// watching payable maunds update live (gross kg -> Katt -> maunds,
// ADR-0002/0003). A bag lighter than the Katt clamps its payable weight at
// zero — flagged here rather than hidden — but still counts toward the bag
// total (labour/bag charges are per-bag, not per-payable-kg).
//
// The back half — picking a buyer, a rate, and generating the Kacha bill /
// Pakka invoice — is issue #23, not yet built.
export function NewTrade() {
  const [farmerId, setFarmerId] = useState('')
  const [lot, setLot] = useState<LotDetail | null>(null)
  const [grossKg, setGrossKg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refreshLot(lotNumber: number) {
    const updated = await api.getLot(lotNumber)
    setLot(updated)
  }

  async function onCreateLot(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const created = await api.createLot(farmerId)
      await refreshLot(created.lotNumber)
    } catch {
      setError('Could not register the lot. Check the farmer id.')
    } finally {
      setBusy(false)
    }
  }

  async function onWeighBag(e: FormEvent) {
    e.preventDefault()
    if (!lot) return
    setError(null)
    setBusy(true)
    try {
      const updated = await api.weighBag(lot.lotNumber, Number(grossKg))
      setLot(updated)
      setGrossKg('')
    } catch {
      setError('Could not record this bag.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>New Trade — Weighing</h1>
      <p style={{ color: '#666' }}>
        Register a lot, then weigh each bag. The Kacha bill / Pakka invoice flow (picking a buyer and a
        rate) is coming soon (issue #23).
      </p>

      {!lot ? (
        <form onSubmit={onCreateLot}>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Farmer id
            <input
              style={{ display: 'block', width: '100%', maxWidth: 320 }}
              value={farmerId}
              onChange={(e) => setFarmerId(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <button type="submit" disabled={busy || !farmerId}>
            {busy ? 'Registering…' : 'Register lot'}
          </button>
        </form>
      ) : (
        <>
          <p>
            Lot #{lot.lotNumber} — {lot.farmerId} ({lot.businessDate}). Katt: {lot.kattKgPerBag} kg/bag.
          </p>

          <form onSubmit={onWeighBag} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', margin: '1rem 0' }}>
            <label>
              Bag gross kg
              <input
                type="number"
                step="0.1"
                value={grossKg}
                onChange={(e) => setGrossKg(e.target.value)}
                disabled={busy}
                required
                style={{ display: 'block', width: 160 }}
              />
            </label>
            <button type="submit" disabled={busy || !grossKg}>
              {busy ? 'Weighing…' : 'Weigh bag'}
            </button>
          </form>

          <div style={{ background: '#f5f5f5', borderRadius: 10, padding: '1rem', margin: '1rem 0' }}>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>Running payable weight</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{lot.payableMaunds.toFixed(2)} maund</div>
            <div style={{ color: '#666' }}>{lot.bags.length} bag(s) weighed</div>
          </div>

          {lot.bags.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  <th>#</th>
                  <th>Gross kg</th>
                  <th>Payable kg</th>
                </tr>
              </thead>
              <tbody>
                {lot.bags.map((bag, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td>{i + 1}</td>
                    <td>{bag.grossKg}</td>
                    <td>
                      {bag.payableKg}
                      {bag.payableKg === 0 && (
                        <span style={{ color: '#a53434', marginLeft: '0.5rem' }}>
                          ⚠ light/wet — clamped at 0, still counts for bag charges
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
    </main>
  )
}
