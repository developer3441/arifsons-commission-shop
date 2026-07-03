import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { api, type ContactKind, type ContactRecord } from '../api'
import { MoneyLabel } from '../money'
import { useOffline } from '../offline/OfflineContext'
import { searchCachedContacts } from '../offline/cache'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

// Shared entity picker (design.md): tap a field → full-screen search sheet →
// type a few letters of name / id / phone → tap the match. Raw-id text boxes are
// never shown; the id is internal plumbing set by onSelect. Backed by
// GET /contacts?kind&q (#53). Used for the farmer, each buyer line, and the
// contractor in New Trade (#54), and later the other action screens (#55).

const PROMPT_KEY: Record<ContactKind, string> = {
  zamindar: 'picker.farmer',
  pakka: 'picker.buyer',
  thekedar: 'picker.contractor',
}

function SearchSheet({
  kind,
  onClose,
  onPick,
}: {
  kind: ContactKind
  onClose: () => void
  onPick: (c: ContactRecord) => void
}) {
  const { t } = useTranslation()
  const { online } = useOffline()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactRecord[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(false)
    setResults(null)
    // Offline, search the cached contact list (ADR-0031) so New Trade composes
    // with no signal; online, hit the live endpoint.
    const load = online ? api.listContacts(kind, query || undefined) : searchCachedContacts(kind, query || undefined)
    load.then((r) => !cancelled && setResults(r)).catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [kind, query, online])

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[var(--color-bg)]" role="dialog" aria-modal="true">
      <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-[var(--color-muted)]">
            <Search size={18} />
          </span>
          <input
            type="search"
            autoFocus
            placeholder={t('contacts.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] ps-10 pe-3 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          />
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t('picker.close')} onClick={onClose} className="h-11 w-11">
          <X size={22} />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {!results && !error && (
          <p role="status" className="py-8 text-center text-[var(--color-muted)]">
            {t('state.loading')}
          </p>
        )}
        {error && (
          <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>
            {t('contacts.loadError')}
          </p>
        )}
        {results && results.length === 0 && (
          <p className="py-8 text-center text-[var(--color-muted)]">{t('contacts.empty')}</p>
        )}
        {results && results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-start shadow-sm hover:bg-[var(--color-surface)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name ?? c.id}</span>
                  <span className="num block truncate text-sm text-[var(--color-muted)]">
                    {c.phone ?? t('contacts.noPhone')}
                  </span>
                </span>
                <span className="shrink-0 text-sm">
                  <MoneyLabel kind={c.kind} balance={c.balance} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ContactPicker({
  kind,
  value,
  onSelect,
  disabled,
  label,
}: {
  kind: ContactKind
  value: ContactRecord | null
  onSelect: (c: ContactRecord) => void
  disabled?: boolean
  label?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const prompt = label ?? t(PROMPT_KEY[kind])

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 text-start',
          'focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50',
          value ? 'border-[var(--color-border)] bg-[var(--color-bg)]' : 'border-dashed border-[var(--color-border)] text-[var(--color-muted)]',
        )}
      >
        <span className="truncate">{value ? value.name ?? value.id : prompt}</span>
        <span className="shrink-0 text-sm text-[var(--color-accent)]">
          {value ? t('picker.change') : <Search size={18} />}
        </span>
      </button>
      {open && (
        <SearchSheet
          kind={kind}
          onClose={() => setOpen(false)}
          onPick={(c) => {
            onSelect(c)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
