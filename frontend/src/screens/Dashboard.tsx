import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api, type DashboardSnapshot, type LedgerBalance } from '../api'
import { formatPkr, MoneyLabel } from '../money'

// Issue #16 — the real Dashboard: the two hero pillars (Cash in Hand, True
// Shop Value — ADR-0010), the 7 ledgers as colour-coded chips, a
// reconciliation indicator, and quick actions. Reads a live projection from
// GET /dashboard (docs/design.md's UI conventions: colour + explicit
// "owes you"/"you owe" label, never a bare +/− sign; loading/empty/error/
// disabled states on every data view).

// Fixed colour mapping per ledger (design.md: "a consistent colour-coded
// chip across the app — the mapping is fixed").
const LEDGER_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  rokar: { label: 'Rokar (Cash)', bg: '#e6f4ea', fg: '#1e7a34' },
  zamindar: { label: 'Zamindar (Farmers)', bg: '#fff4e5', fg: '#946200' },
  beopari: { label: 'Beopari (House trading)', bg: '#eef1ff', fg: '#3949ab' },
  thekedar: { label: 'Thekedar (Contractors)', bg: '#fdeaea', fg: '#a53434' },
  pakka: { label: 'Pakka (Buyers)', bg: '#e6f0fb', fg: '#1a5ca8' },
  revenue: { label: 'Amdani (Revenue)', bg: '#e9f7f0', fg: '#1c7d5a' },
  government: { label: 'Government (Cess)', bg: '#f3ecfa', fg: '#6a3fa0' },
}

function LedgerChip({ ledger }: { ledger: LedgerBalance }) {
  const style = LEDGER_STYLE[ledger.kind] ?? { label: ledger.kind, bg: '#eee', fg: '#333' }
  return (
    <div
      style={{
        background: style.bg,
        color: style.fg,
        borderRadius: 10,
        padding: '0.75rem 1rem',
        minWidth: 200,
      }}
    >
      <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>{style.label}</div>
      <div style={{ marginTop: '0.25rem' }}>
        <MoneyLabel kind={ledger.kind} balance={ledger.balance} />
      </div>
    </div>
  )
}

export function Dashboard() {
  const { user, logout } = useAuth()
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .dashboard()
      .then((data) => {
        if (!cancelled) setSnapshot(data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the dashboard. Try again in a moment.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto', padding: '0 1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>SplitEase</h1>
        <div>
          <span style={{ marginRight: '1rem' }}>
            {user?.name} ({user?.role})
          </span>
          <Link to="/contacts" style={{ marginRight: '1rem' }}>
            Contacts
          </Link>
          <Link to="/bardana" style={{ marginRight: '1rem' }}>
            Bardana
          </Link>
          <Link to="/cess" style={{ marginRight: '1rem' }}>
            Cess
          </Link>
          <Link to="/godown" style={{ marginRight: '1rem' }}>
            Godown
          </Link>
          <Link to="/corrections" style={{ marginRight: '1rem' }}>
            Corrections
          </Link>
          {user?.role === 'owner' && (
            <>
              <Link to="/users" style={{ marginRight: '1rem' }}>
                Manage users
              </Link>
              <Link to="/config" style={{ marginRight: '1rem' }}>
                Shop defaults
              </Link>
              <Link to="/genesis" style={{ marginRight: '1rem' }}>
                Genesis
              </Link>
            </>
          )}
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      {loading && <p>Loading dashboard…</p>}

      {!loading && error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}

      {!loading && !error && snapshot && (
        <>
          <section style={{ display: 'flex', gap: '1.5rem', margin: '1.5rem 0' }}>
            <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', color: '#666' }}>Cash in Hand</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{formatPkr(snapshot.cashInHand)}</div>
            </div>
            <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', color: '#666' }}>True Shop Value</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{formatPkr(snapshot.trueShopValue)}</div>
            </div>
          </section>

          <section
            style={{
              margin: '1rem 0',
              padding: '0.75rem 1rem',
              borderRadius: 10,
              background: snapshot.reconciliation.reconciles ? '#e6f4ea' : '#fdeaea',
              color: snapshot.reconciliation.reconciles ? '#1e7a34' : '#a53434',
            }}
          >
            {snapshot.reconciliation.reconciles
              ? 'Reconciled — True Shop Value matches seed capital + retained profit exactly.'
              : `Reconciliation drift: ${formatPkr(snapshot.reconciliation.drift)}. Something doesn't add up.`}
          </section>

          <h2 style={{ fontSize: '1rem', color: '#666', marginTop: '2rem' }}>Ledgers</h2>
          <section style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {snapshot.ledgers.length === 0 ? (
              <p>No ledger activity yet.</p>
            ) : (
              snapshot.ledgers.map((l) => <LedgerChip key={l.kind} ledger={l} />)
            )}
          </section>

          <h2 style={{ fontSize: '1rem', color: '#666', marginTop: '2rem' }}>Quick actions</h2>
          <nav style={{ display: 'flex', gap: '0.75rem' }}>
            <Link to="/trade">New Trade</Link>
            <Link to="/advance">Issue Advance</Link>
            <Link to="/payment">Record Payment</Link>
          </nav>
        </>
      )}
    </main>
  )
}
