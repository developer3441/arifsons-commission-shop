import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ur from './ur.json'

// Bilingual EN/UR (ADR-0030). Urdu is the default; the choice persists per
// user in localStorage. Direction (LTR/RTL) is applied in LanguageProvider.
export const LANGUAGES = ['en', 'ur'] as const
export type Lang = (typeof LANGUAGES)[number]
export const DEFAULT_LANG: Lang = 'ur'
const STORAGE_KEY = 'splitease.lang'

export function storedLang(): Lang {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  return saved === 'en' || saved === 'ur' ? saved : DEFAULT_LANG
}

export function persistLang(lang: Lang): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang)
}

export const dirFor = (lang: Lang): 'rtl' | 'ltr' => (lang === 'ur' ? 'rtl' : 'ltr')

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ur: { translation: ur } },
  lng: storedLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
