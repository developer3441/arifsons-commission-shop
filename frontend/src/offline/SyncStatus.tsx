import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CloudOff, RefreshCw, Check, AlertTriangle, LogIn } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useOffline } from './OfflineContext'

// The always-visible sync-status indicator (ADR-0031): offline / re-login needed
// / syncing / needs-attention / N-pending (tap to sync now) / all-synced. Lives
// in the AppShell header. Priority order top-down.
export function SyncStatus() {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const { online, pending, needsAttention, syncing, authRequired, syncNow } = useOffline()

  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--color-you-owe)' }} role="status">
        <CloudOff size={16} /> {t('offline.offline')}
      </span>
    )
  }
  if (authRequired) {
    // The 24h token expired mid-sync (ADR-0025); re-login refreshes it and the
    // queue resumes automatically.
    return (
      <button type="button" onClick={logout} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm" style={{ color: 'var(--color-you-owe)' }}>
        <LogIn size={16} /> {t('offline.reLogin')}
      </button>
    )
  }
  if (needsAttention > 0) {
    return (
      <Link to="/sync" className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm" style={{ color: 'var(--color-you-owe)' }}>
        <AlertTriangle size={16} /> {t('offline.needsAttention', { count: needsAttention })}
      </Link>
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
