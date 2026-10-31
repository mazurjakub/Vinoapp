/**
 * File: GrowthStageEditor.tsx
 * Created: 2026-10-02
 * Description: Form and list for recording a plot's growth stage dates.
 */

import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import type { GrowthStageType } from '../../db/schema'
import {
  addGrowthStage,
  deleteGrowthStage,
  listGrowthStagesForVineyard,
} from './growthStageRepo'

const STAGE_VALUES: GrowthStageType[] = [
  'budbreak',
  'shoot10cm',
  'flowering',
  'veraison',
  'ripening',
  'harvest',
]

interface GrowthStageEditorProps {
  vineyardId: number
}

function GrowthStageEditor({ vineyardId }: GrowthStageEditorProps) {
  const { t } = useTranslation()
  const entries = useLiveQuery(
    () => listGrowthStagesForVineyard(vineyardId),
    [vineyardId],
  )
  const [stage, setStage] = useState<GrowthStageType>('budbreak')
  const [date, setDate] = useState('')

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    if (!date) return
    await addGrowthStage({ vineyardId, stage, date })
    setDate('')
  }

  return (
    <div className="growth-stage-editor">
      <h3>{t('growthStage.title')}</h3>
      <p className="growth-stage-hint">{t('growthStage.hint')}</p>
      <form className="form-row" onSubmit={handleAdd}>
        <label>
          {t('growthStage.stage')}
          <select value={stage} onChange={(e) => setStage(e.target.value as GrowthStageType)}>
            {STAGE_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`growthStage.stages.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('growthStage.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <button type="submit">{t('growthStage.add')}</button>
      </form>
      <ul className="growth-stage-list">
        {entries?.map((entry) => (
          <li key={entry.id}>
            <span>
              {entry.year} — {t(`growthStage.stages.${entry.stage}`)}: {entry.date}
            </span>
            <button
              type="button"
              className="btn-link"
              onClick={() => entry.id && deleteGrowthStage(entry.id)}
            >
              {t('growthStage.delete')}
            </button>
          </li>
        ))}
        {entries?.length === 0 && <li className="empty">{t('growthStage.empty')}</li>}
      </ul>
    </div>
  )
}

export default GrowthStageEditor
