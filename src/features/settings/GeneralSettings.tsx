/**
 * File: GeneralSettings.tsx
 * Created: 2026-10-02
 * Description: Settings form for the spray warning, sugar unit and app language.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../db'
import {
  DEFAULT_SPRAY_WARNING_DAYS,
  DEFAULT_SUGAR_UNIT,
  SETTINGS_KEYS,
  type SugarUnit,
} from '../../db/settingsKeys'
import { setSetting } from '../../db/settingsRepo'
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from '../../i18n'

function useSettingValue<T>(key: string, fallback: T): T {
  const row = useLiveQuery(() => db.settings.where('key').equals(key).first(), [key])
  if (row === undefined) return fallback
  return (row.value as T) ?? fallback
}

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  cs: 'Čeština',
  en: 'English',
}

function GeneralSettings() {
  const { t, i18n } = useTranslation()
  const sprayWarningDays = useSettingValue<number>(
    SETTINGS_KEYS.sprayWarningDays,
    DEFAULT_SPRAY_WARNING_DAYS,
  )
  const sugarUnit = useSettingValue<SugarUnit>(SETTINGS_KEYS.sugarUnit, DEFAULT_SUGAR_UNIT)

  return (
    <div className="general-settings">
      <h2>{t('settings.general.title')}</h2>
      <label>
        {t('settings.general.sprayWarningDays')}
        <input
          type="number"
          min={1}
          value={sprayWarningDays}
          onChange={(e) => setSetting(SETTINGS_KEYS.sprayWarningDays, Number(e.target.value))}
        />
      </label>
      <label>
        {t('settings.general.sugarUnit')}
        <select
          value={sugarUnit}
          onChange={(e) => setSetting(SETTINGS_KEYS.sugarUnit, e.target.value as SugarUnit)}
        >
          <option value="NM">°NM</option>
          <option value="Oe">°Oe</option>
        </select>
      </label>
      <label>
        {t('settings.general.language')}
        <select
          value={i18n.language}
          onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {LANGUAGE_NAMES[lang]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export default GeneralSettings
