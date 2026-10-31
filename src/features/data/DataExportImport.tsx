/**
 * File: DataExportImport.tsx
 * Created: 2026-10-03
 * Description: Settings section with the data export and import controls.
 */

import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { buildExportPayload, downloadExport } from './exportRepo'
import { importData, isExportPayload } from './importRepo'

function DataExportImport() {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    setStatus(null)
    try {
      const payload = await buildExportPayload()
      downloadExport(payload)
    } catch {
      setStatus(t('settings.data.exportError'))
    } finally {
      setExporting(false)
    }
  }

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setStatus(null)
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isExportPayload(parsed)) {
        setStatus(t('settings.data.importInvalid'))
        return
      }
      if (!window.confirm(t('settings.data.importConfirm'))) return

      setImporting(true)
      await importData(parsed)
      setStatus(t('settings.data.importSuccess'))
    } catch {
      setStatus(t('settings.data.importError'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="general-settings">
      <h2>{t('settings.data.title')}</h2>
      <p className="growth-stage-hint">{t('settings.data.hint')}</p>
      <p className="growth-stage-hint">{t('settings.data.backupHint')}</p>
      <div className="form-actions">
        <button type="button" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? t('settings.data.exporting') : t('settings.data.export')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          {importing ? t('settings.data.importing') : t('settings.data.import')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => void handleFileSelected(e)}
        />
      </div>
      {status && <p className="form-error">{status}</p>}
    </div>
  )
}

export default DataExportImport
