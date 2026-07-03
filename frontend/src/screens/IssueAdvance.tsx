import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type ContactRecord } from '../api'
import { MoneyLabel } from '../money'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, fieldClass } from '../components/ui/field'
import { ContactPicker } from '../components/ContactPicker'
import { useOffline } from '../offline/OfflineContext'
import { cn } from '../lib/utils'

// Dashboard quick action → Issue Advance (Peshi, ADR-0008). The farmer is chosen
// with the shared ContactPicker (#55) — no raw-id box. Cash-out: rejected if it
// would drive Rokar negative (ADR-0019). Mobile-first, bilingual (ADR-0029/0030).
export function IssueAdvance() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { online } = useOffline()

  const [farmer, setFarmer] = useState<ContactRecord | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newBalance, setNewBalance] = useState<number | null>(null)

  // Preselect the farmer when arriving from their detail screen's "Issue advance".
  useEffect(() => {
    const id = searchParams.get('farmerId')
    if (id) api.getContact(id).then(setFarmer).catch(() => {})
  }, [searchParams])

  async function onSubmit() {
    if (!farmer || !amount) return
    setError(null)
    setBusy(true)
    try {
      const entryId = `advance-${farmer.id}-${Date.now()}`
      await api.issueAdvance(entryId, farmer.id, Number(amount))
      const contact = await api.getContact(farmer.id)
      setNewBalance(contact.balance)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(message.includes('Insufficient cash') ? t('advance.insufficientCash') : t('advance.error'))
    } finally {
      setBusy(false)
    }
  }

  if (newBalance !== null && farmer) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--color-rokar-bg)', color: 'var(--color-rokar-fg)' }}>
          {t('advance.posted')}
        </div>
        <Card className="flex flex-col gap-1">
          <span className="font-medium">{farmer.name ?? farmer.id}</span>
          <span className="text-sm text-[var(--color-muted)]">{t('advance.balanceNow')}</span>
          <span className="text-lg">
            <MoneyLabel kind="zamindar" balance={newBalance} />
          </span>
        </Card>
        <Button type="button" variant="outline" onClick={() => navigate('/')}>
          {t('common.backToDashboard')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('advance.title')}</h1>
      <Card className="flex flex-col gap-3">
        <ContactPicker kind="zamindar" value={farmer} onSelect={setFarmer} disabled={busy} />
        <Field label={t('advance.amount')}>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            className={cn(fieldClass, 'num')}
          />
        </Field>
        <Button type="button" onClick={onSubmit} disabled={busy || !farmer || !amount || !online}>
          {busy ? t('advance.posting') : t('advance.post')}
        </Button>
        {!online && (
          <p role="status" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>
            {t('offline.needsConnection')}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>
            {error}
          </p>
        )}
      </Card>
      <button type="button" onClick={() => navigate('/')} className="text-center text-sm text-[var(--color-accent)]">
        ← {t('nav.dashboard')}
      </button>
    </div>
  )
}
