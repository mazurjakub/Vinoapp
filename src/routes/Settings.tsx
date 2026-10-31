/**
 * File: Settings.tsx
 * Created: 2026-10-03
 * Description: Settings page with general settings and data export and import.
 */

import { useTranslation } from 'react-i18next'
import DataExportImport from '../features/data/DataExportImport'
import GeneralSettings from '../features/settings/GeneralSettings'

function Settings() {
  const { t } = useTranslation()
  return (
    <section>
      <h1>{t('settings.title')}</h1>
      <GeneralSettings />
      <DataExportImport />
    </section>
  )
}

export default Settings
