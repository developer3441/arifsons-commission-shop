import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type LedgerSummary, type LedgerAccountSummary, type AccountStatement } from '../api'
import { MoneyLabel, formatPkr } from '../money'
import { Card } from '../components/ui/card'

// Issue #31 / #56 — the Ledgers grid: the 7 ledgers as colour-coded cards
// (ADR-0004), each tappable into its accounts, each account into its own
// drill-down statement (every entry that touched it, running balance — ADR-0010).
// Read-only projections; mobile-first, bilingual, tokens (ADR-0027/0029/0030).

const LEDGER_ORDER = ['rokar', 'zamindar', 'pakka', 'beopari', 'thekedar', 'revenue', 'government']

type View = { level: 'grid' } | { level: 'accounts'; kind: string } | { level: 'statement'; kind: string; accountId: string }

export function Ledgers() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [view, setView] = useState<View>({ level: 'grid' })

  const [ledgers, setLedgers] = useState<LedgerSummary[] | null>(null)
  const [accounts, setAccounts] = useState<LedgerAccountSummary[] | null>(null)
  const [statement, setStatement] = useState<AccountStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const fail = (key: string) => () => !cancelled && setError(t(key))
    const done = () => !cancelled && setLoading(false)
    if (view.level === 'grid') {
      api.listLedgers().then((r) => !cancelled && setLedgers(r)).catch(fail('ledgers.gridError')).finally(done)
    } else if (view.level === 'accounts') {
      api.listLedgerAccounts(view.kind).then((r) => !cancelled && setAccounts(r)).catch(fail('ledgers.accountsError')).finally(done)
    } else {
      api.getAccountStatement(view.accountId).then((r) => !cancelled && setStatement(r)).catch(fail('ledgers.statementError')).finally(done)
    }
    return () => {
      cancelled = true
    }
  }, [view, t])

  const back =
    view.level === 'grid'
      ? { label: t('nav.dashboard'), go: () => navigate('/') }
      : view.level === 'accounts'
        ? { label: t('ledgers.title'), go: () => setView({ level: 'grid' }) }
        : { label: t(`ledger.${view.kind}`), go: () => setView({ level: 'accounts', kind: view.kind }) }

  const heading =
    view.level === 'grid' ? t('ledgers.title') : view.level === 'accounts' ? t(`ledger.${view.kind}`) : view.accountId

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={back.go} className="self-start text-sm text-[var(--color-accent)]">
        ← {back.label}
      </button>
      <h1 className="text-xl font-bold">{heading}</h1>

      {loading && <p role="status" className="py-8 text-center text-[var(--color-muted)]">{t('state.loading')}</p>}
      {!loading && error && <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>{error}</p>}

      {!loading && !error && view.level === 'grid' && ledgers && (
        <div className="grid grid-cols-2 gap-3">
          {[...ledgers]
            .sort((a, b) => LEDGER_ORDER.indexOf(a.kind) - LEDGER_ORDER.indexOf(b.kind))
            .map((l) => (
              <button
                key={l.kind}
                type="button"
                onClick={() => setView({ level: 'accounts', kind: l.kind })}
                className="rounded-xl p-3 text-start"
                style={{ background: `var(--color-${l.kind}-bg)`, color: `var(--color-${l.kind}-fg)` }}
              >
                <div className="text-sm opacity-90">{t(`ledger.${l.kind}`)}</div>
                <div className="mt-1">
                  <MoneyLabel kind={l.kind} balance={l.balance} />
                </div>
              </button>
            ))}
        </div>
      )}

      {!loading && !error && view.level === 'accounts' && accounts && (
        accounts.length === 0 ? (
          <p className="py-8 text-center text-[var(--color-muted)]">{t('ledgers.noAccounts')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setView({ level: 'statement', kind: view.kind, accountId: a.id })}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-start shadow-sm hover:bg-[var(--color-surface)]"
              >
                <span className="block truncate font-medium">{a.name ?? a.id}</span>
                <span className="shrink-0 text-sm">
                  <MoneyLabel kind={view.kind} balance={a.balance} />
                </span>
              </button>
            ))}
          </div>
        )
      )}

      {!loading && !error && view.level === 'statement' && statement && (
        <div className="flex flex-col gap-3">
          <Card>
            <span className="text-sm text-[var(--color-muted)]">{t('ledgers.balance')}</span>
            <div className="mt-1 text-lg">
              <MoneyLabel kind={view.kind} balance={statement.balance} />
            </div>
          </Card>
          {statement.entries.length === 0 ? (
            <p className="py-8 text-center text-[var(--color-muted)]">{t('ledgers.noEntries')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-start text-[var(--color-muted)]">
                    <th className="py-1 text-start font-medium">{t('ledgers.entryHeader')}</th>
                    <th className="py-1 text-start font-medium">{t('ledgers.amountHeader')}</th>
                    <th className="py-1 text-start font-medium">{t('ledgers.balanceHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.entries.map((line) => (
                    <tr key={line.entryId} className="border-b border-[var(--color-border)]">
                      <td className="py-1">{t(`entryKind.${line.kind}`, line.kind)}</td>
                      <td className="num py-1" style={{ color: line.amount < 0 ? 'var(--color-owed-to-you)' : 'var(--color-you-owe)' }}>
                        {line.amount < 0 ? '−' : '+'}
                        {formatPkr(line.amount)}
                      </td>
                      <td className="num py-1">{formatPkr(line.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
