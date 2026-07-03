import { useTranslation } from 'react-i18next'
import { useLanguage } from '../i18n/LanguageProvider'
import { cn } from '../lib/utils'

// EN / اردو toggle (ADR-0030). Persists per user and flips direction.
export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage()
  const { t } = useTranslation()
  return (
    <div className="inline-flex rounded-lg border border-[var(--color-border)] p-0.5" role="group" aria-label={t('common.language')}>
      {(['en', 'ur'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={cn(
            'min-h-9 rounded-md px-3 text-sm font-medium',
            lang === l ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]' : 'text-[var(--color-muted)]',
          )}
        >
          {l === 'en' ? t('common.english') : t('common.urdu')}
        </button>
      ))}
    </div>
  )
}
