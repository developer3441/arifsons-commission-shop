import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type CostBearer, type ShopConfig } from '../api'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, fieldClass } from '../components/ui/field'
import { cn } from '../lib/utils'

// Issue #18 / #57 — Owner-only Config: the global shop defaults that seed the
// trade engine (ADR-0001/0003/0004/0012). The backend rejects a save from
// anyone but an Owner (403). Mobile-first, bilingual, tokens (ADR-0029/0030).
export function Config() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [config, setConfigState] = useState<ShopConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api
      .getConfig()
      .then(setConfigState)
      .catch(() => setError(t('config.loadError')))
      .finally(() => setLoading(false))
  }, [t])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const updated = await api.setConfig(config)
      setConfigState(updated)
      setSaved(true)
    } catch {
      setError(t('config.saveError'))
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof ShopConfig>(key: K, value: ShopConfig[K]) {
    setConfigState((c) => (c ? { ...c, [key]: value } : c))
    setSaved(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('config.title')}</h1>

      {loading && <p role="status" className="py-8 text-center text-[var(--color-muted)]">{t('state.loading')}</p>}
      {!loading && error && !config && (
        <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>{error}</p>
      )}
      {!loading && !config && !error && (
        <p className="py-8 text-center text-[var(--color-muted)]">{t('config.empty')}</p>
      )}

      {!loading && config && (
        <Card>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <Field label={t('config.farmerCommission')}>
              <input type="number" step="0.01" className={cn(fieldClass, 'num')} value={config.farmerCommissionRate} onChange={(e) => update('farmerCommissionRate', Number(e.target.value))} disabled={saving} />
            </Field>
            <Field label={t('config.buyerCommission')}>
              <input type="number" step="0.01" className={cn(fieldClass, 'num')} value={config.buyerCommissionRate} onChange={(e) => update('buyerCommissionRate', Number(e.target.value))} disabled={saving} />
            </Field>
            <Field label={t('config.katt')}>
              <input type="number" step="0.1" className={cn(fieldClass, 'num')} value={config.kattKgPerBag} onChange={(e) => update('kattKgPerBag', Number(e.target.value))} disabled={saving} />
            </Field>
            <Field label={t('config.labour')}>
              <input type="number" className={cn(fieldClass, 'num')} value={config.perBagLabour} onChange={(e) => update('perBagLabour', Number(e.target.value))} disabled={saving} />
            </Field>
            <Field label={t('config.bagCharge')}>
              <input type="number" className={cn(fieldClass, 'num')} value={config.perBagCharge} onChange={(e) => update('perBagCharge', Number(e.target.value))} disabled={saving} />
            </Field>
            <Field label={t('config.bagBearer')}>
              <select className={fieldClass} value={config.bagBearer} onChange={(e) => update('bagBearer', e.target.value as CostBearer)} disabled={saving}>
                <option value="farmer">{t('config.bearerFarmer')}</option>
                <option value="buyer">{t('config.bearerBuyer')}</option>
              </select>
            </Field>
            <Field label={t('config.labourBearer')}>
              <select className={fieldClass} value={config.labourBearer} onChange={(e) => update('labourBearer', e.target.value as CostBearer)} disabled={saving}>
                <option value="farmer">{t('config.bearerFarmer')}</option>
                <option value="buyer">{t('config.bearerBuyer')}</option>
              </select>
            </Field>
            <Field label={t('config.cessRate')}>
              <input type="number" step="0.001" className={cn(fieldClass, 'num')} value={config.cessRate} onChange={(e) => update('cessRate', Number(e.target.value))} disabled={saving} />
            </Field>
            <Button type="submit" disabled={saving}>
              {saving ? t('config.saving') : t('config.save')}
            </Button>
            {error && (
              <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{error}</p>
            )}
            {saved && (
              <p role="status" className="text-sm" style={{ color: 'var(--color-rokar-fg)' }}>{t('config.saved')}</p>
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
