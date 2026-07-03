import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type GodownSummary } from '../api'
import { formatPkr } from '../money'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, fieldClass } from '../components/ui/field'
import { cn } from '../lib/utils'

// Issue #28 / #57 — Godown/Mal Khata: bag count, net kg, running average
// cost/kg (ADR-0005). Stock enters as a side effect of a house-buyer trade;
// resale draws it down. Mobile-first, bilingual, tokens (ADR-0029/0030).
export function Godown() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<GodownSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [buyerId, setBuyerId] = useState('')
  const [bagsSold, setBagsSold] = useState('')
  const [netKgSold, setNetKgSold] = useState('')
  const [saleProceeds, setSaleProceeds] = useState('')
  const [resaleBusy, setResaleBusy] = useState(false)
  const [resaleError, setResaleError] = useState<string | null>(null)
  const [resaleResult, setResaleResult] = useState<{ costOfGoodsSold: number; tradingPnL: number } | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    api
      .getGodown()
      .then(setSummary)
      .catch(() => setError(t('godown.loadError')))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [])

  async function onResale(e: FormEvent) {
    e.preventDefault()
    setResaleError(null)
    setResaleResult(null)
    setResaleBusy(true)
    try {
      const entryId = `resale-${buyerId}-${Date.now()}`
      const posted = await api.resellStock(entryId, buyerId, Number(bagsSold), Number(netKgSold), Number(saleProceeds))
      setResaleResult({ costOfGoodsSold: posted.costOfGoodsSold, tradingPnL: posted.tradingPnL })
      setBuyerId('')
      setBagsSold('')
      setNetKgSold('')
      setSaleProceeds('')
      reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setResaleError(message.includes('400') ? t('godown.tooMuch') : t('godown.resaleError'))
    } finally {
      setResaleBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('godown.title')}</h1>
      <p className="text-sm text-[var(--color-muted)]">{t('godown.intro')}</p>

      {loading && <p role="status" className="py-8 text-center text-[var(--color-muted)]">{t('state.loading')}</p>}
      {!loading && error && (
        <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>{error}</p>
      )}

      {!loading && !error && summary && summary.bags === 0 && (
        <p className="py-8 text-center text-[var(--color-muted)]">{t('godown.empty')}</p>
      )}

      {!loading && !error && summary && summary.bags > 0 && (
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-muted)]">{t('godown.bags')}</span>
            <span className="num font-semibold">{summary.bags}</span>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2">
            <span className="text-sm text-[var(--color-muted)]">{t('godown.netKg')}</span>
            <span className="num font-semibold">{summary.netKg.toLocaleString('en-PK')}</span>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2">
            <span className="text-sm text-[var(--color-muted)]">{t('godown.totalCostBasis')}</span>
            <span className="num font-semibold">{formatPkr(summary.totalCostBasis)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2">
            <span className="text-sm text-[var(--color-muted)]">{t('godown.averageCostPerKg')}</span>
            <span className="num font-semibold">{t('godown.perKg', { amount: formatPkr(Math.round(summary.averageCostPerKg)) })}</span>
          </div>
        </Card>
      )}

      {!loading && !error && summary && summary.bags > 0 && (
        <Card>
          <form onSubmit={onResale} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('godown.resaleTitle')}</h2>
            <p className="text-xs text-[var(--color-muted)]">{t('godown.resaleHint')}</p>
            <Field label={t('godown.buyerId')}>
              <input className={fieldClass} value={buyerId} onChange={(e) => setBuyerId(e.target.value)} disabled={resaleBusy} required />
            </Field>
            <Field label={t('godown.bagsSold')}>
              <input type="number" min={1} max={summary.bags} inputMode="numeric" className={cn(fieldClass, 'num')} value={bagsSold} onChange={(e) => setBagsSold(e.target.value)} disabled={resaleBusy} required />
            </Field>
            <Field label={t('godown.netKgSold')}>
              <input type="number" min={1} max={summary.netKg} step="0.1" inputMode="decimal" className={cn(fieldClass, 'num')} value={netKgSold} onChange={(e) => setNetKgSold(e.target.value)} disabled={resaleBusy} required />
            </Field>
            <Field label={t('godown.saleProceeds')}>
              <input type="number" min={1} inputMode="numeric" className={cn(fieldClass, 'num')} value={saleProceeds} onChange={(e) => setSaleProceeds(e.target.value)} disabled={resaleBusy} required />
            </Field>
            <Button type="submit" disabled={resaleBusy || !buyerId || !bagsSold || !netKgSold || !saleProceeds}>
              {resaleBusy ? t('godown.recording') : t('godown.record')}
            </Button>
            {resaleError && (
              <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{resaleError}</p>
            )}
            {resaleResult && (
              <p role="status" className="text-sm" style={{ color: 'var(--color-rokar-fg)' }}>
                {t('godown.resalePosted', { cogs: formatPkr(resaleResult.costOfGoodsSold), pnl: formatPkr(resaleResult.tradingPnL) })}
              </p>
            )}
          </form>
        </Card>
      )}

      <button type="button" onClick={() => navigate('/')} className="text-center text-sm text-[var(--color-accent)]">
        ← {t('nav.dashboard')}
      </button>
    </div>
  )
}
