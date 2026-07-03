import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'

// Issue #52 — the "More" tab: the long-tail and Owner-only screens that don't
// earn a bottom-tab slot (ADR-0029). Restyled per-screen in later slices.
const ITEMS = [
  { to: '/sync', key: 'more.sync', owner: false },
  { to: '/bardana', key: 'more.bardana', owner: false },
  { to: '/cess', key: 'more.cess', owner: false },
  { to: '/godown', key: 'more.godown', owner: false },
  { to: '/corrections', key: 'more.corrections', owner: false },
  { to: '/users', key: 'more.users', owner: true },
  { to: '/config', key: 'more.config', owner: true },
  { to: '/genesis', key: 'more.genesis', owner: true },
] as const

export function More() {
  const { t } = useTranslation()
  const { user } = useAuth()
  return (
    <div className="flex flex-col gap-2">
      {ITEMS.filter((i) => !i.owner || user?.role === 'owner').map((i) => (
        <Link
          key={i.to}
          to={i.to}
          className="min-h-13 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-lg hover:bg-[var(--color-surface)]"
        >
          {t(i.key)}
        </Link>
      ))}
    </div>
  )
}
