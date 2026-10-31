/**
 * File: WorkForm.tsx
 * Created: 2026-10-03
 * Description: Form for adding a vineyard work record with an optional photo.
 */

import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkType } from '../../db/schema'
import type { WorkInput } from './worksRepo'

const WORK_TYPES: WorkType[] = ['pruning', 'green_work', 'fertilizing', 'other']

function defaultDatetime(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

interface WorkFormProps {
  vineyardId: number
  onSubmit: (input: WorkInput) => Promise<void>
  onCancel: () => void
}

function WorkForm({ vineyardId, onSubmit, onCancel }: WorkFormProps) {
  const { t } = useTranslation()
  const [datetime, setDatetime] = useState(defaultDatetime())
  const [type, setType] = useState<WorkType>('pruning')
  const [notes, setNotes] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({
        vineyardId,
        datetime,
        type,
        notes: notes.trim() || undefined,
        photoBlob,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="journal-form" onSubmit={handleSubmit}>
      <label>
        {t('journal.works.form.datetime')}
        <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} required />
      </label>
      <label>
        {t('journal.works.form.type')}
        <select value={type} onChange={(e) => setType(e.target.value as WorkType)}>
          {WORK_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`journal.works.types.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('journal.works.form.notes')}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
      <label>
        {t('journal.works.form.photo')}
        <input type="file" accept="image/*" onChange={(e) => setPhotoBlob(e.target.files?.[0])} />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {t('journal.works.add')}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {t('vineyard.cancel')}
        </button>
      </div>
    </form>
  )
}

export default WorkForm
