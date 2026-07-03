import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type Lang, dirFor, persistLang, storedLang } from './index'

// Owns the current language: applies <html lang/dir> for RTL (ADR-0030),
// persists the choice, and exposes a setter for the switcher.
type LanguageContextValue = { lang: Lang; setLang: (l: Lang) => void }
const LanguageContext = createContext<LanguageContextValue | null>(null)

function applyDocument(lang: Lang) {
  const el = document.documentElement
  el.lang = lang
  el.dir = dirFor(lang)
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const [lang, setLangState] = useState<Lang>(storedLang)

  useEffect(() => {
    applyDocument(lang)
    if (i18n.language !== lang) void i18n.changeLanguage(lang)
  }, [lang, i18n])

  const setLang = (l: Lang) => {
    persistLang(l)
    setLangState(l)
  }

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
