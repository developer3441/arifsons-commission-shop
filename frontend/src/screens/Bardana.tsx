import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type BardanaLoan, type ContactRecord } from '../api'
import { formatPkr } from '../money'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, fieldClass } from '../components/ui/field'
import { ContactPicker } from '../components/ContactPicker'
import { useOffline } from '../offline/OfflineContext'
import { cn } from '../lib/utils'

// Issue #21 / #55 — Bardana tracker: lend/return empty bags to a farmer, chosen
// with the shared ContactPicker (no raw-id box). Bags-out is a farmer receivable
// that counts toward True Shop Value via the farmer's own ledger (ADR-0010).
// Mobile-first, bilingual (ADR-0029/0030).
export function Bardana() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { online, enqueueWrite } = useOffline()

  const [loans, setLoans] = useState<BardanaLoan[] | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [queuedMsg, setQueuedMsg] = useState(false)

  const [lendFarmer, setLendFarmer] = useState<ContactRecord | null>(null)
  const [lendBags, setLendBags] = useState('')
  const [lendBagValue, setLendBagValue] = useState('')
  const [lendBusy, setLendBusy] = useState(false)
  const [lendError, setLendError] = useState<string | null>(null)

  const [returnFarmer, setReturnFarmer] = useState<ContactRecord | null>(null)
  const [returnBags, setReturnBags] = useState('')
  const [returnBusy, setReturnBusy] = useState(false)
  const [returnError, setReturnError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    setError(false)
    api.listBardanaLoans().then(setLoans).catch(() => setError(true)).finally(() => setLoading(false))
  }
  useEffect(reload, [])

  async function onLend() {
    if (!lendFarmer || !lendBags) return
    setLendError(null)
    setQueuedMsg(false)
    setLendBusy(true)
    const entryId = `bardana-lend-${lendFarmer.id}-${Date.now()}`
    const bagValue = lendBagValue ? Number(lendBagValue) : undefined
    try {
      if (!online) {
        // Bardana is a safe write — queue it offline (ADR-0031).
        await enqueueWrite({
          id: entryId,
          kind: 'bardana-lend',
          payload: { entryId, farmerId: lendFarmer.id, bags: Number(lendBags), bagValue },
          summary: `${t('bardana.lend')} · ${lendFarmer.name ?? lendFarmer.id}`,
          createdAt: Date.now(),
        })
        setQueuedMsg(true)
      } else {
        await api.lendBardana(entryId, lendFarmer.id, Number(lendBags), bagValue)
        reload()
      }
      setLendFarmer(null)
      setLendBags('')
      setLendBagValue('')
    } catch {
      setLendError(t('bardana.lendError'))
    } finally {
      setLendBusy(false)
    }
  }

  async function onReturn() {
    if (!returnFarmer || !returnBags) return
    setReturnError(null)
    setQueuedMsg(false)
    setReturnBusy(true)
    const entryId = `bardana-return-${returnFarmer.id}-${Date.now()}`
    try {
      if (!online) {
        await enqueueWrite({
          id: entryId,
          kind: 'bardana-return',
          payload: { entryId, farmerId: returnFarmer.id, bags: Number(returnBags) },
          summary: `${t('bardana.returnBags')} · ${returnFarmer.name ?? returnFarmer.id}`,
          createdAt: Date.now(),
        })
        setQueuedMsg(true)
        setReturnFarmer(null)
        setReturnBags('')
      } else {
        await api.returnBardana(entryId, returnFarmer.id, Number(returnBags))
        setReturnFarmer(null)
        setReturnBags('')
        reload()
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      setReturnError(m.includes('404') ? t('bardana.noLoan') : m.includes('400') ? t('bardana.tooMany') : t('bardana.returnError'))
    } finally {
      setReturnBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('bardana.title')}</h1>
      <p className="text-sm text-[var(--color-muted)]">{t('bardana.intro')}</p>
      {queuedMsg && (
        <p role="status" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--color-thekedar-bg)', color: 'var(--color-thekedar-fg)' }}>
          {t('offline.queued')}
        </p>
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('bardana.lend')}</h2>
        <ContactPicker kind="zamindar" value={lendFarmer} onSelect={setLendFarmer} disabled={lendBusy} />
        <div className="flex gap-2">
          <div className="flex-1">
            <Field label={t('bardana.bags')}>
              <input type="number" min={1} inputMode="numeric" value={lendBags} onChange={(e) => setLendBags(e.target.value)} disabled={lendBusy} className={cn(fieldClass, 'num')} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label={t('bardana.bagValue')}>
              <input type="number" min={0} inputMode="numeric" value={lendBagValue} onChange={(e) => setLendBagValue(e.target.value)} disabled={lendBusy} className={cn(fieldClass, 'num')} />
            </Field>
          </div>
        </div>
        <Button type="button" onClick={onLend} disabled={lendBusy || !lendFarmer || !lendBags}>
          {lendBusy ? t('bardana.lending') : t('bardana.lendAction')}
        </Button>
        {lendError && <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{lendError}</p>}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('bardana.returnBags')}</h2>
        <ContactPicker kind="zamindar" value={returnFarmer} onSelect={setReturnFarmer} disabled={returnBusy} />
        <Field label={t('bardana.bags')}>
          <input type="number" min={1} inputMode="numeric" value={returnBags} onChange={(e) => setReturnBags(e.target.value)} disabled={returnBusy} className={cn(fieldClass, 'num')} />
        </Field>
        <Button type="button" onClick={onReturn} disabled={returnBusy || !returnFarmer || !returnBags}>
          {returnBusy ? t('bardana.recording') : t('bardana.returnAction')}
        </Button>
        {returnError && <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{returnError}</p>}
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('bardana.outstanding')}</h2>
        {loading && <p role="status" className="py-6 text-center text-[var(--color-muted)]">{t('state.loading')}</p>}
        {!loading && error && <p role="alert" className="py-6 text-center" style={{ color: 'var(--color-you-owe)' }}>{t('bardana.listError')}</p>}
        {!loading && !error && loans && loans.length === 0 && (
          <p className="py-6 text-center text-[var(--color-muted)]">{t('bardana.none')}</p>
        )}
        {!loading && !error && loans && loans.length > 0 && (
          <div className="flex flex-col gap-2">
            {loans.map((l) => (
              <Card key={l.farmerId} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.farmerId}</span>
                  <span className="num block text-sm text-[var(--color-muted)]">
                    {l.bagsOut} {t('bardana.bagsOut')} · {formatPkr(l.bagValue)}
                  </span>
                </span>
                <span className="num shrink-0 font-semibold">{formatPkr(l.bagsOut * l.bagValue)}</span>
              </Card>
            ))}
          </div>
        )}
      </section>

      <button type="button" onClick={() => navigate('/')} className="text-center text-sm text-[var(--color-accent)]">
        ← {t('nav.dashboard')}
      </button>
    </div>
  )
}
