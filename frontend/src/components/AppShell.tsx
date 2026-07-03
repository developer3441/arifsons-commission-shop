import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, BookOpen, Users, Menu, Plus, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

// Mobile-first app shell (ADR-0029): a bottom tab bar + a prominent center "+"
// that opens quick actions. Thumb-reachable; RTL-mirrors automatically because
// the bar is a flex row. Owner-only / long-tail screens live under More.
const TABS = [
  { to: '/', labelKey: 'nav.dashboard', Icon: LayoutDashboard, end: true },
  { to: '/ledgers', labelKey: 'nav.ledgers', Icon: BookOpen, end: false },
  { to: '/contacts', labelKey: 'nav.contacts', Icon: Users, end: false },
  { to: '/more', labelKey: 'nav.more', Icon: Menu, end: false },
] as const

const QUICK_ACTIONS = [
  { to: '/trade', key: 'nav.newTrade' },
  { to: '/advance', key: 'nav.issueAdvance' },
  { to: '/payment', key: 'nav.recordPayment' },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-[var(--color-surface)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
        <span className="text-lg font-bold text-[var(--color-accent)]">{t('app.name')}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" size="md" onClick={logout} className="text-sm">
            {t('common.logout')}
          </Button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      {sheetOpen && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40" onClick={() => setSheetOpen(false)}>
          <div
            className="mb-24 w-[min(28rem,90vw)] rounded-2xl bg-[var(--color-bg)] p-2 shadow-lg"
            role="dialog"
            aria-label={t('dashboard.quickActions')}
            onClick={(e) => e.stopPropagation()}
          >
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.to}
                className="min-h-13 w-full rounded-lg px-4 text-start text-lg hover:bg-[var(--color-surface)]"
                onClick={() => {
                  setSheetOpen(false)
                  navigate(a.to)
                }}
              >
                {t(a.key)}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-2xl items-center justify-around border-t border-[var(--color-border)] bg-[var(--color-bg)] pb-[env(safe-area-inset-bottom)]">
        {TABS.slice(0, 2).map((tab) => (
          <TabLink key={tab.to} {...tab} />
        ))}
        <button
          type="button"
          aria-label={t('nav.newTrade')}
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((v) => !v)}
          className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-lg"
        >
          {sheetOpen ? <X size={26} /> : <Plus size={26} />}
        </button>
        {TABS.slice(2).map((tab) => (
          <TabLink key={tab.to} {...tab} />
        ))}
      </nav>

      <span className="sr-only">{user?.name}</span>
    </div>
  )
}

function TabLink({ to, labelKey, Icon, end }: (typeof TABS)[number]) {
  const { t } = useTranslation()
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs',
          isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]',
        )
      }
    >
      <Icon size={22} />
      {t(labelKey)}
    </NavLink>
  )
}
