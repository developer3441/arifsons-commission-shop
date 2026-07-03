import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type CashBook, type ContactRecord } from '../api'
import { formatPkr } from '../money'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, fieldClass } from '../components/ui/field'
import { ContactPicker } from '../components/ContactPicker'
import { cn } from '../lib/utils'

// Issue #27 / #55 — the Rokar-only settle-up actions (ADR-0019): buyer payment,
// farmer withdrawal, contractor payout, plus the Rokar cash book. Each party is
// chosen with the shared ContactPicker (no raw-id box). Cash-outs are rejected
// if they'd drive Rokar negative. Mobile-first, bilingual (ADR-0029/0030).
export function RecordPayment() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [cashBook, setCashBook] = useState<CashBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [buyer, setBuyer] = useState<ContactRecord | null>(null)
  const [buyerBusy, setBuyerBusy] = useState(false)
  const [buyerError, setBuyerError] = useState<string | null>(null)

  const [farmer, setFarmer] = useState<ContactRecord | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawBusy, setWithdrawBusy] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  const [thekedar, setThekedar] = useState<ContactRecord | null>(null)
  const [payoutBusy, setPayoutBusy] = useState(false)
  const [payoutError, setPayoutError] = useState<string | null>(null)

  useEffect(() => {
    const id = searchParams.get('farmerId')
    if (id) api.getContact(id).then(setFarmer).catch(() => {})
  }, [searchParams])

  function reload() {
    setLoading(true)
    setError(false)
    api.getCashBook().then(setCashBook).catch(() => setError(true)).finally(() => setLoading(false))
  }
  useEffect(reload, [])

  async function onBuyerPayment() {
    if (!buyer) return
    setBuyerError(null)
    setBuyerBusy(true)
    try {
      await api.payBuyer(`pay-buyer-${buyer.id}-${Date.now()}`, buyer.id)
      setBuyer(null)
      reload()
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      setBuyerError(m.includes('400') ? t('payment.buyerNoReceivable') : t('payment.buyerError'))
    } finally {
      setBuyerBusy(false)
    }
  }

  async function onWithdrawal() {
    if (!farmer || !withdrawAmount) return
    setWithdrawError(null)
    setWithdrawBusy(true)
    try {
      await api.withdrawForFarmer(`withdraw-${farmer.id}-${Date.now()}`, farmer.id, Number(withdrawAmount))
      setWithdrawAmount('')
      reload()
    } catch (err) {
      const m = (err instanceof Error ? err.message : '').toLowerCase()
      setWithdrawError(m.includes('insufficient cash') ? t('payment.withdrawInsufficient') : t('payment.withdrawError'))
    } finally {
      setWithdrawBusy(false)
    }
  }

  async function onPayout() {
    if (!thekedar) return
    setPayoutError(null)
    setPayoutBusy(true)
    try {
      await api.payoutContractor(`payout-${thekedar.id}-${Date.now()}`, thekedar.id)
      setThekedar(null)
      reload()
    } catch (err) {
      const m = (err instanceof Error ? err.message : '').toLowerCase()
      setPayoutError(m.includes('insufficient cash') ? t('payment.payoutInsufficient') : t('payment.payoutError'))
    } finally {
      setPayoutBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('payment.title')}</h1>
      <p className="text-sm text-[var(--color-muted)]">{t('payment.intro')}</p>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('payment.buyerPayment')}</h2>
        <p className="text-xs text-[var(--color-muted)]">{t('payment.buyerHint')}</p>
        <ContactPicker kind="pakka" value={buyer} onSelect={setBuyer} disabled={buyerBusy} />
        <Button type="button" onClick={onBuyerPayment} disabled={buyerBusy || !buyer}>
          {buyerBusy ? t('payment.recording') : t('payment.recordPayment')}
        </Button>
        {buyerError && <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{buyerError}</p>}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('payment.withdrawal')}</h2>
        <p className="text-xs text-[var(--color-muted)]">{t('payment.withdrawalHint')}</p>
        <ContactPicker kind="zamindar" value={farmer} onSelect={setFarmer} disabled={withdrawBusy} />
        <Field label={t('payment.amount')}>
          <input type="number" min={1} inputMode="numeric" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} disabled={withdrawBusy} className={cn(fieldClass, 'num')} />
        </Field>
        <Button type="button" onClick={onWithdrawal} disabled={withdrawBusy || !farmer || !withdrawAmount}>
          {withdrawBusy ? t('payment.recording') : t('payment.withdraw')}
        </Button>
        {withdrawError && <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{withdrawError}</p>}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('payment.payout')}</h2>
        <p className="text-xs text-[var(--color-muted)]">{t('payment.payoutHint')}</p>
        <ContactPicker kind="thekedar" value={thekedar} onSelect={setThekedar} disabled={payoutBusy} />
        <Button type="button" onClick={onPayout} disabled={payoutBusy || !thekedar}>
          {payoutBusy ? t('payment.recording') : t('payment.recordPayout')}
        </Button>
        {payoutError && <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{payoutError}</p>}
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('payment.cashBook')}</h2>
        {loading && <p role="status" className="py-6 text-center text-[var(--color-muted)]">{t('state.loading')}</p>}
        {!loading && error && <p role="alert" className="py-6 text-center" style={{ color: 'var(--color-you-owe)' }}>{t('payment.cashBookError')}</p>}
        {!loading && !error && cashBook && (
          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-muted)]">{t('payment.currentBalance')}</span>
              <span className="num text-lg font-bold">{formatPkr(cashBook.balance)}</span>
            </div>
            {cashBook.entries.length === 0 ? (
              <p className="text-[var(--color-muted)]">{t('payment.noCash')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-start text-[var(--color-muted)]">
                      <th className="py-1 text-start font-medium">{t('payment.entryHeader')}</th>
                      <th className="py-1 text-start font-medium">{t('payment.amountHeader')}</th>
                      <th className="py-1 text-start font-medium">{t('payment.balanceHeader')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashBook.entries.map((line) => (
                      <tr key={line.entryId} className="border-b border-[var(--color-border)]">
                        <td className="py-1">{t(`payment.kind.${line.kind}`, line.kind)}</td>
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
          </Card>
        )}
      </section>

      <button type="button" onClick={() => navigate('/')} className="text-center text-sm text-[var(--color-accent)]">
        ← {t('nav.dashboard')}
      </button>
    </div>
  )
}
