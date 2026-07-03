import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { api, type ContactKind, type ContactRecord } from '../api'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, fieldClass } from '../components/ui/field'
import { ContactPicker } from '../components/ContactPicker'
import { cn } from '../lib/utils'

// Issue #19 / #55 — Genesis: one-time opening-balance import (ADR-0022). Each
// pre-existing balance names a contact via the shared ContactPicker (add the
// contact on the Contacts screen first, then set its opening balance here — no
// raw-id box). Posts as a single dated entry so the Dashboard reconciles to zero
// drift from day one. Mobile-first, bilingual (ADR-0029/0030).

type Row = { key: number; contact: ContactRecord | null; balance: string }

function BalanceSection({
  title,
  hint,
  kind,
  rows,
  onChange,
  disabled,
}: {
  title: string
  hint: string
  kind: ContactKind
  rows: Row[]
  onChange: (rows: Row[]) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const addRow = () => onChange([...rows, { key: (rows.at(-1)?.key ?? -1) + 1, contact: null, balance: '' }])
  const updateRow = (key: number, patch: Partial<Row>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const removeRow = (key: number) => onChange(rows.filter((r) => r.key !== key))

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{title}</h2>
        <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="flex items-end gap-2">
          <div className="flex-1">
            <ContactPicker kind={kind} value={row.contact} onSelect={(c) => updateRow(row.key, { contact: c })} disabled={disabled} />
          </div>
          <div className="w-32">
            <Field label={t('genesis.balance')}>
              <input
                type="number"
                inputMode="numeric"
                value={row.balance}
                onChange={(e) => updateRow(row.key, { balance: e.target.value })}
                disabled={disabled}
                className={cn(fieldClass, 'num')}
              />
            </Field>
          </div>
          <Button type="button" variant="ghost" size="md" aria-label={t('genesis.remove')} onClick={() => removeRow(row.key)} disabled={disabled} className="h-11 px-2">
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addRow} disabled={disabled} className="w-full">
        + {t('genesis.addRow')}
      </Button>
    </Card>
  )
}

export function Genesis() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rokarOpening, setRokarOpening] = useState('0')
  const [farmerRows, setFarmerRows] = useState<Row[]>([])
  const [buyerRows, setBuyerRows] = useState<Row[]>([])
  const [contractorRows, setContractorRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const toBalances = (rows: Row[]) =>
    rows
      .filter((r) => r.contact)
      .map((r) => ({ id: r.contact!.id, name: r.contact!.name, balance: Number(r.balance) || 0 }))

  async function onSubmit() {
    setError(null)
    setBusy(true)
    try {
      await api.postGenesis({
        rokarOpening: Number(rokarOpening),
        farmerBalances: toBalances(farmerRows),
        buyerBalances: toBalances(buyerRows),
        contractorBalances: toBalances(contractorRows),
      })
      setDone(true)
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      setError(m.includes('409') ? t('genesis.already') : m.includes('400') ? t('genesis.needBalance') : t('genesis.error'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl px-4 py-3 text-sm" role="status" style={{ background: 'var(--color-rokar-bg)', color: 'var(--color-rokar-fg)' }}>
          {t('genesis.posted')}
        </div>
        <Button type="button" variant="outline" onClick={() => navigate('/')}>
          {t('common.backToDashboard')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('genesis.title')}</h1>
      <p className="text-sm text-[var(--color-muted)]">{t('genesis.intro')}</p>

      <Card>
        <Field label={t('genesis.openingCash')}>
          <input type="number" inputMode="numeric" value={rokarOpening} onChange={(e) => setRokarOpening(e.target.value)} disabled={busy} className={cn(fieldClass, 'num')} />
        </Field>
      </Card>

      <BalanceSection title={t('genesis.farmers')} hint={t('genesis.farmersHint')} kind="zamindar" rows={farmerRows} onChange={setFarmerRows} disabled={busy} />
      <BalanceSection title={t('genesis.buyers')} hint={t('genesis.buyersHint')} kind="pakka" rows={buyerRows} onChange={setBuyerRows} disabled={busy} />
      <BalanceSection title={t('genesis.contractors')} hint={t('genesis.contractorsHint')} kind="thekedar" rows={contractorRows} onChange={setContractorRows} disabled={busy} />

      <Button type="button" onClick={onSubmit} disabled={busy}>
        {busy ? t('genesis.posting') : t('genesis.post')}
      </Button>
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>
          {error}
        </p>
      )}
      <button type="button" onClick={() => navigate('/')} className="text-center text-sm text-[var(--color-accent)]">
        ← {t('nav.dashboard')}
      </button>
    </div>
  )
}
