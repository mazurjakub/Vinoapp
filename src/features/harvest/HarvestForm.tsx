/**
 * File: HarvestForm.tsx
 * Created: 2026-10-03
 * Description: Form for adding a harvest record.
 */

import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../db'
import type { SugarUnit } from '../../db/schema'
import { DEFAULT_SUGAR_UNIT, SETTINGS_KEYS } from '../../db/settingsKeys'
import { parseDecimal } from '../../i18n/parseDecimal'
import type { HarvestInput } from './harvestsRepo'

function defaultDate(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

interface HarvestFormProps {
  vineyardId: number
  onSubmit: (input: HarvestInput) => Promise<void>
  onCancel: () => void
}

function HarvestForm({ vineyardId, onSubmit, onCancel }: HarvestFormProps) {
  const { t } = useTranslation()
  const defaultSugarUnitSetting = useLiveQuery(
    () => db.settings.where('key').equals(SETTINGS_KEYS.sugarUnit).first(),
    [],
  )
  const defaultSugarUnit = (defaultSugarUnitSetting?.value as SugarUnit | undefined) ?? DEFAULT_SUGAR_UNIT

  const [date, setDate] = useState(defaultDate())
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [yearTouched, setYearTouched] = useState(false)
  const [weightKg, setWeightKg] = useState('')
  const [sugar, setSugar] = useState('')
  const [sugarUnit, setSugarUnit] = useState<SugarUnit>(defaultSugarUnit)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [numberError, setNumberError] = useState(false)

  const handleDateChange = (value: string) => {
    setDate(value)
    if (!yearTouched) {
      const parsedYear = value.slice(0, 4)
      if (parsedYear) setYear(parsedYear)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const parsedWeight = parseDecimal(weightKg)
    const parsedSugar = sugar.trim() ? parseDecimal(sugar) : undefined
    if (parsedWeight === null || parsedWeight < 0 || parsedSugar === null) {
      setNumberError(true)
      return
    }
    setNumberError(false)
    setSubmitting(true)
    try {
      await onSubmit({
        vineyardId,
        date,
        year: Number(year),
        weightKg: parsedWeight,
        sugar: parsedSugar,
        sugarUnit: parsedSugar !== undefined ? sugarUnit : undefined,
        notes: notes.trim() || undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="journal-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          {t('harvest.form.date')}
          <input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} required />
        </label>
        <label>
          {t('harvest.form.year')}
          <input
            type="number"
            value={year}
            onChange={(e) => {
              setYearTouched(true)
              setYear(e.target.value)
            }}
            required
          />
        </label>
      </div>
      <label>
        {t('harvest.form.weightKg')}
        <input
          inputMode="decimal"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          required
        />
      </label>
      <div className="form-row">
        <label>
          {t('harvest.form.sugar')}
          <input inputMode="decimal" value={sugar} onChange={(e) => setSugar(e.target.value)} />
        </label>
        <label>
          {t('harvest.form.sugarUnit')}
          <select value={sugarUnit} onChange={(e) => setSugarUnit(e.target.value as SugarUnit)}>
            <option value="NM">°NM</option>
            <option value="Oe">°Oe</option>
          </select>
        </label>
      </div>
      <label>
        {t('harvest.form.notes')}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
      {numberError && <p className="form-error">{t('common.invalidNumber')}</p>}
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {t('harvest.add')}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {t('vineyard.cancel')}
        </button>
      </div>
    </form>
  )
}

export default HarvestForm
