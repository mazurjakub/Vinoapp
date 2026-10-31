/**
 * File: SprayForm.tsx
 * Created: 2026-10-03
 * Description: Form for adding a spray record.
 */

import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { SprayTarget } from '../../db/schema'
import type { SprayInput } from './spraysRepo'

const TARGETS: SprayTarget[] = ['downy', 'powdery', 'botrytis', 'other']

function defaultDatetime(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

interface SprayFormProps {
  vineyardId: number
  onSubmit: (input: SprayInput) => Promise<void>
  onCancel: () => void
}

function SprayForm({ vineyardId, onSubmit, onCancel }: SprayFormProps) {
  const { t } = useTranslation()
  const [datetime, setDatetime] = useState(defaultDatetime())
  const [product, setProduct] = useState('')
  const [activeSubstance, setActiveSubstance] = useState('')
  const [dose, setDose] = useState('')
  const [target, setTarget] = useState<SprayTarget>('downy')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({
        vineyardId,
        datetime,
        product: product.trim(),
        activeSubstance: activeSubstance.trim(),
        dose: dose.trim(),
        target,
        notes: notes.trim() || undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="journal-form" onSubmit={handleSubmit}>
      <label>
        {t('journal.sprays.form.datetime')}
        <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} required />
      </label>
      <label>
        {t('journal.sprays.form.product')}
        <input value={product} onChange={(e) => setProduct(e.target.value)} required />
      </label>
      <div className="form-row">
        <label>
          {t('journal.sprays.form.activeSubstance')}
          <input value={activeSubstance} onChange={(e) => setActiveSubstance(e.target.value)} required />
        </label>
        <label>
          {t('journal.sprays.form.dose')}
          <input value={dose} onChange={(e) => setDose(e.target.value)} required />
        </label>
      </div>
      <label>
        {t('journal.sprays.form.target')}
        <select value={target} onChange={(e) => setTarget(e.target.value as SprayTarget)}>
          {TARGETS.map((value) => (
            <option key={value} value={value}>
              {t(`journal.sprays.targets.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('journal.sprays.form.notes')}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {t('journal.sprays.add')}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {t('vineyard.cancel')}
        </button>
      </div>
    </form>
  )
}

export default SprayForm
