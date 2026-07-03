import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { useOffline } from '../offline/OfflineContext'
import { listPending, listNeedsAttention, listDiscarded, type QueuedOp, type DiscardedOp } from '../offline/queue'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { fieldClass } from '../components/ui/field'

// Issue #61 — the Sync Center: the offline queue's pending items, the
// "needs attention" list (terminal 4xx rejections) with retry / discard-with-
// reason, and the discarded history. Nothing is ever silently lost (ADR-0031).
// Reachable from More and from the sync-status indicator.
export function SyncCenter() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { online, authRequired, syncing, syncNow, retryItem, discardItem, pending, needsAttention } = useOffline()

  const [pendingOps, setPendingOps] = useState<QueuedOp[]>([])
  const [attentionOps, setAttentionOps] = useState<QueuedOp[]>([])
  const [discarded, setDiscarded] = useState<DiscardedOp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [discardingSeq, setDiscardingSeq] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setPendingOps(await listPending())
      setAttentionOps(await listNeedsAttention())
      setDiscarded(await listDiscarded())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reload whenever the queue counts change (a sync landed, an item was parked).
  useEffect(() => {
    void reload()
  }, [reload, pending, needsAttention, syncing])

  async function onRetry(seq: number) {
    await retryItem(seq)
    await reload()
  }

  async function onConfirmDiscard(seq: number) {
    if (!reason.trim()) {
      setReasonError(true)
      return
    }
    await discardItem(seq, reason.trim())
    setDiscardingSeq(null)
    setReason('')
    setReasonError(false)
    await reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('sync.title')}</h1>

      {authRequired && (
        <Card className="flex flex-col gap-2" style={{ background: 'var(--color-thekedar-bg)', color: 'var(--color-thekedar-fg)' }}>
          <p className="text-sm">{t('sync.authExpired')}</p>
          <Button type="button" variant="outline" onClick={logout} className="self-start">
            {t('sync.signIn')}
          </Button>
        </Card>
      )}

      {loading && <p role="status" className="py-8 text-center text-[var(--color-muted)]">{t('state.loading')}</p>}
      {!loading && error && <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>{t('sync.loadError')}</p>}

      {!loading && !error && (
        <>
          {/* Needs attention — terminal rejections to resolve */}
          {attentionOps.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--color-you-owe)' }}>
                {t('sync.needsAttention')}
              </h2>
              {attentionOps.map((op) => (
                <Card key={op.seq} className="flex flex-col gap-2">
                  <span className="font-medium">{op.summary}</span>
                  {op.lastError && <span className="text-xs text-[var(--color-muted)]">{op.lastError}</span>}
                  {discardingSeq === op.seq ? (
                    <div className="flex flex-col gap-2">
                      <input
                        aria-label={t('sync.reasonPlaceholder')}
                        placeholder={t('sync.reasonPlaceholder')}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className={fieldClass}
                      />
                      {reasonError && <span className="text-xs" style={{ color: 'var(--color-you-owe)' }}>{t('sync.reasonRequired')}</span>}
                      <div className="flex gap-2">
                        <Button type="button" onClick={() => onConfirmDiscard(op.seq!)}>{t('sync.confirmDiscard')}</Button>
                        <Button type="button" variant="ghost" onClick={() => { setDiscardingSeq(null); setReason(''); setReasonError(false) }}>
                          {t('sync.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => onRetry(op.seq!)} disabled={!online}>
                        {t('sync.retry')}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setDiscardingSeq(op.seq!)} style={{ color: 'var(--color-you-owe)' }}>
                        {t('sync.discard')}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </section>
          )}

          {/* Pending — awaiting sync */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('sync.pending')}</h2>
              {pendingOps.length > 0 && (
                <Button type="button" variant="outline" size="md" onClick={syncNow} disabled={!online || syncing} className="text-sm">
                  {t('sync.syncNow')}
                </Button>
              )}
            </div>
            {pendingOps.length === 0 && attentionOps.length === 0 ? (
              <p className="py-6 text-center text-[var(--color-muted)]">{t('sync.allClear')}</p>
            ) : (
              pendingOps.map((op) => (
                <Card key={op.seq} className="flex items-center justify-between gap-2">
                  <span className="truncate">{op.summary}</span>
                  <span className="text-xs text-[var(--color-muted)]">{t('offline.pendingBadge')}</span>
                </Card>
              ))
            )}
          </section>

          {/* Discarded history — with recorded reasons */}
          {discarded.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('sync.discarded')}</h2>
              {discarded.map((op) => (
                <Card key={op.seq} className="flex flex-col gap-0.5">
                  <span className="truncate font-medium">{op.summary}</span>
                  <span className="text-xs text-[var(--color-muted)]">{op.reason}</span>
                </Card>
              ))}
            </section>
          )}
        </>
      )}

      <button type="button" onClick={() => navigate('/')} className="text-center text-sm text-[var(--color-accent)]">
        ← {t('nav.dashboard')}
      </button>
    </div>
  )
}
