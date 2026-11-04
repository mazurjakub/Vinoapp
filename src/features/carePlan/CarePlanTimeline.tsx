/**
 * File: CarePlanTimeline.tsx
 * Created: 2026-10-03
 * Description: Shows what to inspect at the current, upcoming and past growth stages.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../db'
import { localDateKey } from '../weather/format'
import carePlanRaw from '../../data/carePlan.cz-bio.json'
import { parseCarePlan } from './carePlanSchema'
import { inspectionRowIndex, pickCurrentPhase, rowStatuses, type RowStatus } from './growthPhaseMapping'

// Treatments (products, doses, alternatives) are deliberately not read here:
// the app doesn't recommend products yet. They stay in the data file as source material.
const CARE_PLAN = parseCarePlan(carePlanRaw)
const CODE_SYMBOLS: Record<string, string> = { '1': '❶', '2': '❷', '3': '❸', '4': '❹', '5': '❺', '6': '❻', '7': '❼', '8': '❽' }

interface CarePlanTimelineProps {
  vineyardId: number
}

function CarePlanTimeline({ vineyardId }: CarePlanTimelineProps) {
  const { t, i18n } = useTranslation()
  const entries = useLiveQuery(
    () => db.growthStages.where('vineyardId').equals(vineyardId).toArray(),
    [vineyardId],
  )

  const today = localDateKey(new Date())
  const season = new Date().getFullYear()
  const phase = pickCurrentPhase(entries ?? [], today, season)
  const statuses = rowStatuses(CARE_PLAN.stages, phase)
  const targetLabel = (id: string) => t(`carePlanData.targets.${id}`)
  const inspections = CARE_PLAN.inspections ?? []

  const inspectionsByRow = new Map<number, typeof inspections>()
  for (const inspection of inspections) {
    const row = inspectionRowIndex(inspection, CARE_PLAN.stages)
    inspectionsByRow.set(row, [...(inspectionsByRow.get(row) ?? []), inspection])
  }

  const groups: Array<{ status: RowStatus; heading: string }> = [
    { status: 'current', heading: t('carePlan.headings.current') },
    { status: 'upcoming', heading: t('carePlan.headings.upcoming') },
    { status: 'past', heading: t('carePlan.headings.past') },
  ]

  return (
    <div className="care-plan">
      <p>
        {phase === 'none'
          ? t('carePlan.noPhase')
          : t('carePlan.currentPhase', { phase: t(`growthStage.stages.${phase}`) })}
      </p>

      {groups.map((group) => {
        const rows = CARE_PLAN.stages
          .map((stage, index) => ({ stage, index }))
          .filter(({ index }) => statuses[index] === group.status)
        if (rows.length === 0) return null
        return (
          <section key={group.status} className="journal-section">
            <h2>{group.heading}</h2>
            <ul className="journal-list">
              {rows.map(({ stage, index }) => (
                <li key={index}>
                  <div className="journal-entry-main">
                    <strong>
                      {CODE_SYMBOLS[stage.code]} {t(`carePlanData.stages.${stage.labelKey}`)}
                    </strong>
                  </div>
                  <p className="journal-entry-notes">
                    {t('carePlan.targets')} {stage.targets.map(targetLabel).join(', ')}
                  </p>

                  {(inspectionsByRow.get(index) ?? []).map((inspection) => {
                    const textKey = `carePlanData.inspections.${inspection.id}`
                    return (
                      <div key={inspection.id} className="care-inspection">
                        <p className="journal-entry-detail">
                          <strong>{targetLabel(inspection.target)}:</strong> {t(`${textKey}.description`)}
                        </p>
                        {i18n.exists(`${textKey}.threshold`) && (
                          <p className="journal-entry-notes">
                            {t('carePlan.threshold')} {t(`${textKey}.threshold`)}
                          </p>
                        )}
                        {i18n.exists(`${textKey}.note`) && (
                          <p className="journal-entry-notes">{t(`${textKey}.note`)}</p>
                        )}
                      </div>
                    )
                  })}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export default CarePlanTimeline
