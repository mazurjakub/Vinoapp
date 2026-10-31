/**
 * File: index.ts
 * Created: 2026-10-02
 * Description: i18next setup, supported languages and the saved language choice.
 */

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import cs from './locales/cs.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['cs', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const LANGUAGE_STORAGE_KEY = 'vinar.language'

function getStoredLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored === 'cs' || stored === 'en') return stored
  return 'cs'
}

export function setLanguage(language: SupportedLanguage): void {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  void i18next.changeLanguage(language)
}

/** Maps the app's short language code to an Intl-compatible locale for date formatting. */
export function toIntlLocale(language: string): string {
  return language === 'en' ? 'en-GB' : 'cs-CZ'
}

void i18next.use(initReactI18next).init({
  resources: {
    cs: { translation: cs },
    en: { translation: en },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'cs',
  interpolation: { escapeValue: false },
})

i18next.on('languageChanged', (language) => {
  document.documentElement.lang = language
})
document.documentElement.lang = i18next.language

export default i18next
