import { useTranslation } from 'react-i18next'
import { CloudOff, RefreshCw, Check } from 'lucide-react'
import { useOffline } from './OfflineContext'

// The always-visible sync-status indicator (ADR-0031): offline / syncing /
// N-pending (tap to sync now) / all-synced. Lives in the AppShell header.
export function SyncStatus() {
  const { t } = useTranslation()
  const { online, pending, syncing, syncNow } = useOffline()

  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--color-you-owe)' }} role="status">
        <CloudOff size={16} /> {t('offline.offline')}
      </span>
    )
  }
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)]" role="status">
        <RefreshCw size={16} className="animate-spin" /> {t('offline.syncing')}
      </span>
    )
  }
  if (pending > 0) {
    return (
      <button
        type="button"
        onClick={syncNow}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-accent)]"
      >
        <RefreshCw size={16} /> {t('offline.pending', { count: pending })}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)]" role="status">
      <Check size={16} /> {t('offline.synced')}
    </span>
  )
}
