import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type CashBook } from '../api'
import { formatPkr } from '../money'

// Issue #27 — the Rokar-only "settle-up" actions (ADR-0019): buyer payment,
// farmer withdrawal, contractor payout, plus the Rokar cash book (cash in /
// cash out with a running balance). farmerId can arrive via the query string
// from the farmer detail screen's "Withdraw" entry point (issue #26).

const ENTRY_KIND_LABEL: Record<string, string> = {
  opening_balance: 'Opening balance',
  peshi_advance: 'Advance (Peshi)',
  buyer_payment: 'Buyer payment',
  farmer_withdrawal: 'Farmer withdrawal',
  contractor_payout: 'Contractor payout',
  cess_remittance: 'Cess remittance',
}

export function RecordPayment() {
  const [searchParams] = useSearchParams()

  const [cashBook, setCashBook] = useState<CashBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [buyerId, setBuyerId] = useState('')
  const [buyerBusy, setBuyerBusy] = useState(false)
  const [buyerError, setBuyerError] = useState<string | null>(null)

  const [farmerId, setFarmerId] = useState(searchParams.get('farmerId') ?? '')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawBusy, setWithdrawBusy] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  const [thekedarId, setThekedarId] = useState('')
  const [payoutBusy, setPayoutBusy] = useState(false)
  const [payoutError, setPayoutError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    api
      .getCashBook()
      .then(setCashBook)
      .catch(() => setError('Could not load the Rokar cash book.'))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function onBuyerPayment(e: FormEvent) {
    e.preventDefault()
    setBuyerError(null)
    setBuyerBusy(true)
    try {
      const entryId = `pay-buyer-${buyerId}-${Date.now()}`
      await api.payBuyer(entryId, buyerId)
      setBuyerId('')
      reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setBuyerError(
        message.includes('400')
          ? 'This buyer has no outstanding receivable to pay.'
          : 'Could not record the buyer payment. Check the buyer id.',
      )
    } finally {
      setBuyerBusy(false)
    }
  }

  async function onWithdrawal(e: FormEvent) {
    e.preventDefault()
    setWithdrawError(null)
    setWithdrawBusy(true)
    try {
      const entryId = `withdraw-${farmerId}-${Date.now()}`
      await api.withdrawForFarmer(entryId, farmerId, Number(withdrawAmount))
      setWithdrawAmount('')
      reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('insufficient cash')) {
        setWithdrawError('Not enough cash in Rokar to cover this withdrawal — Rokar can never go negative.')
      } else {
        setWithdrawError("Could not record the withdrawal. Check the farmer id and that they hold enough balance.")
      }
    } finally {
      setWithdrawBusy(false)
    }
  }

  async function onPayout(e: FormEvent) {
    e.preventDefault()
    setPayoutError(null)
    setPayoutBusy(true)
    try {
      const entryId = `payout-${thekedarId}-${Date.now()}`
      await api.payoutContractor(entryId, thekedarId)
      setThekedarId('')
      reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('insufficient cash')) {
        setPayoutError('Not enough cash in Rokar to cover this payout — Rokar can never go negative.')
      } else {
        setPayoutError('Could not record the payout. Check the contractor id and that wages are owed.')
      }
    } finally {
      setPayoutBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Record Payment</h1>
      <p style={{ color: '#666' }}>
        The Rokar-only settle-up actions (ADR-0019): each moves physical cash and can never drive Rokar
        negative.
      </p>

      <fieldset style={{ margin: '1rem 0', border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
        <legend>Buyer payment (Rokar up, buyer settled to zero)</legend>
        <form onSubmit={onBuyerPayment} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            Buyer id
            <input value={buyerId} onChange={(e) => setBuyerId(e.target.value)} disabled={buyerBusy} required style={{ display: 'block' }} />
          </label>
          <button type="submit" disabled={buyerBusy || !buyerId}>
            {buyerBusy ? 'Recording…' : 'Record payment'}
          </button>
        </form>
        {buyerError && (
          <p role="alert" style={{ color: 'crimson' }}>
            {buyerError}
          </p>
        )}
      </fieldset>

      <fieldset style={{ margin: '1rem 0', border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
        <legend>Farmer withdrawal (Rokar down, balance reduced)</legend>
        <form onSubmit={onWithdrawal} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            Farmer id
            <input value={farmerId} onChange={(e) => setFarmerId(e.target.value)} disabled={withdrawBusy} required style={{ display: 'block' }} />
          </label>
          <label>
            Amount (PKR)
            <input
              type="number"
              min={1}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              disabled={withdrawBusy}
              required
              style={{ display: 'block', width: 160 }}
            />
          </label>
          <button type="submit" disabled={withdrawBusy || !farmerId || !withdrawAmount}>
            {withdrawBusy ? 'Recording…' : 'Withdraw'}
          </button>
        </form>
        {withdrawError && (
          <p role="alert" style={{ color: 'crimson' }}>
            {withdrawError}
          </p>
        )}
      </fieldset>

      <fieldset style={{ margin: '1rem 0', border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
        <legend>Contractor payout (Rokar down, contractor settled to zero)</legend>
        <form onSubmit={onPayout} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            Contractor id
            <input value={thekedarId} onChange={(e) => setThekedarId(e.target.value)} disabled={payoutBusy} required style={{ display: 'block' }} />
          </label>
          <button type="submit" disabled={payoutBusy || !thekedarId}>
            {payoutBusy ? 'Recording…' : 'Record payout'}
          </button>
        </form>
        {payoutError && (
          <p role="alert" style={{ color: 'crimson' }}>
            {payoutError}
          </p>
        )}
      </fieldset>

      <h2>Rokar cash book</h2>
      {loading && <p>Loading…</p>}
      {!loading && error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
      {!loading && !error && cashBook && (
        <>
          <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>Current balance: {formatPkr(cashBook.balance)}</p>
          {cashBook.entries.length === 0 ? (
            <p>No cash has moved through Rokar yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  <th>Entry</th>
                  <th>Cash in / out</th>
                  <th>Balance after</th>
                </tr>
              </thead>
              <tbody>
                {cashBook.entries.map((line) => (
                  <tr key={line.entryId} style={{ borderBottom: '1px solid #eee' }}>
                    <td>{ENTRY_KIND_LABEL[line.kind] ?? line.kind}</td>
                    <td style={{ color: line.amount < 0 ? '#a53434' : '#1e7a34' }}>
                      {line.amount < 0 ? '−' : '+'}
                      {formatPkr(line.amount)}
                    </td>
                    <td>{formatPkr(line.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  )
}
