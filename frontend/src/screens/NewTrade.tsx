import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type LotDetail, type TradeResult } from '../api'
import { Bill } from './Bill'

// Issue #22 (front half) + issue #23/#24 (back half): the full New Trade
// flow. Register a lot, weigh bags one at a time (running payable maunds
// live), then split the lot across one or more buyers at their own rates
// and save — that runs the trade engine, posts append-only, and shows the
// Kacha bill / per-buyer Pakka invoices with the settlement cascade
// breakdown.
type LineDraft = { key: number; buyerId: string; bagCount: string; ratePerMaund: string }

export function NewTrade() {
  const [farmerId, setFarmerId] = useState('')
  const [lot, setLot] = useState<LotDetail | null>(null)
  const [grossKg, setGrossKg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [thekedarId, setThekedarId] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([{ key: 0, buyerId: '', bagCount: '', ratePerMaund: '' }])
  const [saleBusy, setSaleBusy] = useState(false)
  const [saleError, setSaleError] = useState<string | null>(null)
  const [result, setResult] = useState<TradeResult | null>(null)

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: (prev.at(-1)?.key ?? -1) + 1, buyerId: '', bagCount: '', ratePerMaund: '' },
    ])
  }
  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))
  }

  const totalLineBags = lines.reduce((sum, l) => sum + (Number(l.bagCount) || 0), 0)

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

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!lot) return
    setSaleError(null)
    setSaleBusy(true)
    try {
      const entryId = `trade-${lot.lotNumber}-${Date.now()}`
      const posted = await api.postTrade({
        entryId,
        lotNumber: lot.lotNumber,
        thekedarId,
        lines: lines.map((l) => ({
          buyerId: l.buyerId,
          bagCount: Number(l.bagCount),
          ratePerMaund: Number(l.ratePerMaund),
        })),
      })
      setResult(posted)
    } catch {
      setSaleError('Could not save this trade. Check the buyer/contractor ids, bag counts, and rates.')
    } finally {
      setSaleBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>New Trade</h1>

      {result ? (
        <>
          <p role="status" style={{ color: '#1e7a34' }}>
            Trade saved.
          </p>
          <Bill result={result} />
          <Link to="/">Back to Dashboard</Link>
        </>
      ) : (
        <>
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
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
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

              {lot.bags.length > 0 && (
                <fieldset style={{ border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
                  <legend>Sell this lot</legend>
                  <p style={{ color: '#666', fontSize: '0.85rem' }}>
                    Split across one or more buyers — each line takes the next N bags (in weighing order).{' '}
                    {totalLineBags} / {lot.bags.length} bags assigned.
                  </p>
                  <form onSubmit={onSave}>
                    <label style={{ display: 'block', margin: '0.5rem 0' }}>
                      Contractor id (labour)
                      <input
                        style={{ display: 'block', width: '100%', maxWidth: 320 }}
                        value={thekedarId}
                        onChange={(e) => setThekedarId(e.target.value)}
                        disabled={saleBusy}
                        required
                      />
                    </label>

                    {lines.map((line) => (
                      <div key={line.key} style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0', alignItems: 'flex-end' }}>
                        <label>
                          Buyer id
                          <input
                            style={{ display: 'block', width: 180 }}
                            value={line.buyerId}
                            onChange={(e) => updateLine(line.key, { buyerId: e.target.value })}
                            disabled={saleBusy}
                            required
                          />
                        </label>
                        <label>
                          Bags
                          <input
                            type="number"
                            min={1}
                            style={{ display: 'block', width: 90 }}
                            value={line.bagCount}
                            onChange={(e) => updateLine(line.key, { bagCount: e.target.value })}
                            disabled={saleBusy}
                            required
                          />
                        </label>
                        <label>
                          Rate/maund (PKR)
                          <input
                            type="number"
                            style={{ display: 'block', width: 140 }}
                            value={line.ratePerMaund}
                            onChange={(e) => updateLine(line.key, { ratePerMaund: e.target.value })}
                            disabled={saleBusy}
                            required
                          />
                        </label>
                        {lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(line.key)} disabled={saleBusy}>
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={addLine} disabled={saleBusy} style={{ marginBottom: '0.75rem' }}>
                      + Split to another buyer
                    </button>
                    <div>
                      <button
                        type="submit"
                        disabled={
                          saleBusy ||
                          !thekedarId ||
                          lines.some((l) => !l.buyerId || !l.bagCount || !l.ratePerMaund)
                        }
                      >
                        {saleBusy ? 'Saving…' : 'Save trade'}
                      </button>
                    </div>
                    {saleError && (
                      <p role="alert" style={{ color: 'crimson' }}>
                        {saleError}
                      </p>
                    )}
                  </form>
                </fieldset>
              )}
            </>
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
