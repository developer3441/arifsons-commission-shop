import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type LedgerSummary, type LedgerAccountSummary, type AccountStatement } from '../api'
import { MoneyLabel, formatPkr } from '../money'

// Issue #31 — the Ledgers grid: the 7 ledgers as colour-coded cards
// (ADR-0004), each tappable into its accounts, each account tappable into
// its own drill-down statement (every entry that touched it, running
// balance) — ADR-0010.

const LEDGER_LABEL: Record<string, string> = {
  rokar: 'Rokar (Cash)',
  zamindar: 'Zamindar (Farmers)',
  beopari: 'Beopari (Own-trading)',
  thekedar: 'Thekedar (Contractors)',
  pakka: 'Pakka (Buyers)',
  revenue: 'Amdani (Revenue)',
  government: 'Cess (Government)',
}

const ENTRY_KIND_LABEL: Record<string, string> = {
  opening_balance: 'Opening balance',
  peshi_advance: 'Advance (Peshi)',
  trade: 'Sale',
  buyer_payment: 'Buyer payment',
  farmer_withdrawal: 'Farmer withdrawal',
  contractor_payout: 'Contractor payout',
  cess_remittance: 'Cess remittance',
  bardana_loan: 'Bardana lent',
  bardana_resolution: 'Bardana resolved',
  stock_resale: 'Godown resale',
}

type View = { level: 'grid' } | { level: 'accounts'; kind: string } | { level: 'statement'; kind: string; accountId: string }

export function Ledgers() {
  const [view, setView] = useState<View>({ level: 'grid' })

  const [ledgers, setLedgers] = useState<LedgerSummary[] | null>(null)
  const [accounts, setAccounts] = useState<LedgerAccountSummary[] | null>(null)
  const [statement, setStatement] = useState<AccountStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    if (view.level === 'grid') {
      api.listLedgers().then(setLedgers).catch(() => setError('Could not load the ledgers.')).finally(() => setLoading(false))
    } else if (view.level === 'accounts') {
      api
        .listLedgerAccounts(view.kind)
        .then(setAccounts)
        .catch(() => setError('Could not load this ledger.'))
        .finally(() => setLoading(false))
    } else {
      api
        .getAccountStatement(view.accountId)
        .then(setStatement)
        .catch(() => setError('Could not load this account.'))
        .finally(() => setLoading(false))
    }
  }, [view])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        {view.level === 'grid' && <Link to="/">&larr; Dashboard</Link>}
        {view.level === 'accounts' && <a href="#" onClick={(e) => { e.preventDefault(); setView({ level: 'grid' }) }}>&larr; Ledgers</a>}
        {view.level === 'statement' && (
          <a href="#" onClick={(e) => { e.preventDefault(); setView({ level: 'accounts', kind: view.kind }) }}>
            &larr; {LEDGER_LABEL[view.kind] ?? view.kind}
          </a>
        )}
      </p>

      {view.level === 'grid' && <h1>Ledgers</h1>}
      {view.level === 'accounts' && <h1>{LEDGER_LABEL[view.kind] ?? view.kind}</h1>}
      {view.level === 'statement' && <h1>{view.accountId}</h1>}

      {loading && <p>Loading…</p>}
      {!loading && error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}

      {!loading && !error && view.level === 'grid' && ledgers && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          {ledgers.map((l) => (
            <div
              key={l.kind}
              onClick={() => setView({ level: 'accounts', kind: l.kind })}
              style={{ cursor: 'pointer', border: '1px solid #ddd', borderRadius: 10, padding: '1rem', background: '#fafafa' }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>{LEDGER_LABEL[l.kind] ?? l.kind}</div>
              <MoneyLabel kind={l.kind} balance={l.balance} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && view.level === 'accounts' && accounts && (() => {
        const currentKind = view.kind
        return accounts.length === 0 ? (
          <p>No accounts yet in this ledger.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                <th>Id</th>
                <th>Name</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                  onClick={() => setView({ level: 'statement', kind: currentKind, accountId: a.id })}
                >
                  <td>{a.id}</td>
                  <td>{a.name ?? '—'}</td>
                  <td>
                    <MoneyLabel kind={currentKind} balance={a.balance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      })()}

      {!loading && !error && view.level === 'statement' && statement && (
        <>
          <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatPkr(statement.balance)}</p>
          {statement.entries.length === 0 ? (
            <p>No entries have touched this account yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  <th>Entry</th>
                  <th>Amount</th>
                  <th>Balance after</th>
                </tr>
              </thead>
              <tbody>
                {statement.entries.map((line) => (
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
