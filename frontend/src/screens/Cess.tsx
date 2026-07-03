import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api'
import { formatPkr } from '../money'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'

// Issue #25 / #57 — Cess / Government: the running cess-held liability
// (ADR-0004) and an Owner-only "remit to government" action, guard-railed
// against negative cash (ADR-0019). Mobile-first, bilingual (ADR-0029/0030).
export function Cess() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [held, setHeld] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [remitError, setRemitError] = useState<string | null>(null)
  const [remitted, setRemitted] = useState<number | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    api
      .getCessHeld()
      .then((r) => setHeld(r.held))
      .catch(() => setError(t('cess.loadError')))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [])

  async function onRemit() {
    setRemitError(null)
    setBusy(true)
    try {
      const entryId = `cess-remit-${Date.now()}`
      const res = await api.remitCess(entryId)
      setRemitted(res.amountRemitted)
      reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('Insufficient cash')) {
        setRemitError(t('cess.insufficientCash'))
      } else if (message.includes('No cess is held')) {
        setRemitError(t('cess.noCess'))
      } else {
        setRemitError(t('cess.remitError'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('cess.title')}</h1>

      {loading && <p role="status" className="py-8 text-center text-[var(--color-muted)]">{t('state.loading')}</p>}
      {!loading && error && (
        <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>{error}</p>
      )}
      {!loading && !error && held !== null && (
        <>
          <Card
            className="border-0"
            style={{ background: 'var(--color-government-bg)', color: 'var(--color-government-fg)' }}
          >
            <div className="text-sm opacity-90">{t('cess.held')}</div>
            <div className="num mt-1 text-2xl font-bold">{formatPkr(held)}</div>
          </Card>

          {user?.role === 'owner' ? (
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={onRemit} disabled={busy || held === 0}>
                {busy ? t('cess.remitting') : t('cess.remit')}
              </Button>
              {remitted !== null && (
                <p role="status" className="text-sm" style={{ color: 'var(--color-rokar-fg)' }}>
                  {t('cess.remitted', { amount: formatPkr(remitted) })}
                </p>
              )}
              {remitError && (
                <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{remitError}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">{t('cess.ownerOnly')}</p>
          )}
        </>
      )}

      <button type="button" onClick={() => navigate('/')} className="text-center text-sm text-[var(--color-accent)]">
        ← {t('nav.dashboard')}
      </button>
    </div>
  )
}
