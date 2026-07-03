import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type DashboardSnapshot, type LedgerBalance } from '../api'
import { formatPkr, MoneyLabel } from '../money'
import { Card } from '../components/ui/card'
import { useOffline } from '../offline/OfflineContext'

// Issue #52 — the reference Dashboard (ADR-0028). Two hero pillars (Cash in
// Hand, True Shop Value — ADR-0010), the 7 ledgers as colour-coded cards, a
// reconciliation indicator, and quick actions. This screen sets the visual bar
// for every other screen. Mobile-first, bilingual, tokens (ADR-0027/0029/0030).

const LEDGER_ORDER = ['rokar', 'zamindar', 'pakka', 'beopari', 'thekedar', 'revenue', 'government']

function LedgerCard({ ledger }: { ledger: LedgerBalance }) {
  const { t } = useTranslation()
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: `var(--color-${ledger.kind}-bg)`, color: `var(--color-${ledger.kind}-fg)` }}
    >
      <div className="text-sm opacity-90">{t(`ledger.${ledger.kind}`)}</div>
      <div className="mt-1">
        <MoneyLabel kind={ledger.kind} balance={ledger.balance} />
      </div>
    </div>
  )
}

export function Dashboard() {
  const { t } = useTranslation()
  const { syncedAt } = useOffline()
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  // Re-fetch on mount and again after each successful queue flush (syncedAt bumps)
  // so the balances reflect what just synced (ADR-0031).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    api
      .dashboard()
      .then((data) => !cancelled && setSnapshot(data))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [syncedAt])

  if (loading)
    return (
      <p role="status" className="py-8 text-center text-[var(--color-muted)]">
        {t('state.loading')}
      </p>
    )
  if (error || !snapshot)
    return (
      <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>
        {t('state.error')}
      </p>
    )

  const ledgers = [...snapshot.ledgers].sort(
    (a, b) => LEDGER_ORDER.indexOf(a.kind) - LEDGER_ORDER.indexOf(b.kind),
  )
  const reconciles = snapshot.reconciliation.reconciles

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3">
        <Card className="bg-[var(--color-accent)] text-[var(--color-accent-fg)]">
          <div className="text-sm opacity-90">{t('dashboard.cashInHand')}</div>
          <div className="num mt-1 text-2xl font-bold">{formatPkr(snapshot.cashInHand)}</div>
        </Card>
        <Card>
          <div className="text-sm text-[var(--color-muted)]">{t('dashboard.trueShopValue')}</div>
          <div className="num mt-1 text-2xl font-bold">{formatPkr(snapshot.trueShopValue)}</div>
        </Card>
      </section>

      <div
        role="status"
        className="rounded-xl px-4 py-3 text-sm"
        style={{
          background: reconciles ? 'var(--color-rokar-bg)' : 'var(--color-thekedar-bg)',
          color: reconciles ? 'var(--color-rokar-fg)' : 'var(--color-thekedar-fg)',
        }}
      >
        {reconciles
          ? t('dashboard.reconciled')
          : t('dashboard.drift', { amount: formatPkr(snapshot.reconciliation.drift) })}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">{t('dashboard.ledgers')}</h2>
        {ledgers.length === 0 ? (
          <p className="text-[var(--color-muted)]">{t('dashboard.noActivity')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {ledgers.map((l) => (
              <LedgerCard key={l.kind} ledger={l} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">{t('dashboard.quickActions')}</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { to: '/trade', key: 'nav.newTrade' },
            { to: '/advance', key: 'nav.issueAdvance' },
            { to: '/payment', key: 'nav.recordPayment' },
          ].map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-center text-sm font-medium hover:bg-[var(--color-surface)]"
            >
              {t(a.key)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
