/**
 * File: growthPhaseMapping.ts
 * Created: 2026-10-03
 * Description: Maps recorded growth stages to care plan rows and their past, current or upcoming status.
 */

import type { GrowthStageType } from '../../db/schema'
import type { CareInspection, CareStage } from './carePlanTypes'

/** 'none' = no growth stage recorded for this season yet (or all are in the future). */
export type CurrentPhase = GrowthStageType | 'none'
export type RowStatus = 'past' | 'current' | 'upcoming'

/**
 * Rough mapping from growth stages to care plan rows (by `bbchFrom`). The app has only one
 * flowering stage, so it covers rows ❸–❺.
 */
const CURRENT_BBCH_BY_PHASE: Record<CurrentPhase, string[]> = {
  none: ['01'],
  budbreak: ['09'],
  shoot10cm: ['13'],
  flowering: ['53', '57', '69'],
  veraison: ['81'],
  ripening: [],
  harvest: [],
}

const PHASE_ORDER: GrowthStageType[] = ['budbreak', 'shoot10cm', 'flowering', 'veraison', 'ripening', 'harvest']

export interface GrowthStageEntry {
  stage: GrowthStageType
  date: string
  year: number
}

/** Latest recorded stage on or before `today` in `season`; ties on date go to the later stage. */
export function pickCurrentPhase(entries: GrowthStageEntry[], today: string, season: number): CurrentPhase {
  const candidates = entries.filter((e) => e.year === season && e.date <= today)
  if (candidates.length === 0) return 'none'
  const latest = [...candidates].sort(
    (a, b) => a.date.localeCompare(b.date) || PHASE_ORDER.indexOf(a.stage) - PHASE_ORDER.indexOf(b.stage),
  )
  return latest[latest.length - 1].stage
}

/** First row whose `bbchFrom` is inside the inspection's BBCH range, otherwise the last row before it. */
export function inspectionRowIndex(inspection: CareInspection, stages: CareStage[]): number {
  const from = Number(inspection.bbchFrom)
  const to = Number(inspection.bbchTo)
  const inRange = stages.findIndex((s) => {
    const start = Number(s.bbchFrom)
    return start >= from && start <= to
  })
  if (inRange >= 0) return inRange

  let lastBefore = -1
  stages.forEach((s, i) => {
    if (Number(s.bbchFrom) < from) lastBefore = i
  })
  return lastBefore
}

/** past / current / upcoming for each row of the plan. */
export function rowStatuses(stages: CareStage[], phase: CurrentPhase): RowStatus[] {
  const currentIdx = stages
    .map((s, i) => (CURRENT_BBCH_BY_PHASE[phase].includes(s.bbchFrom) ? i : -1))
    .filter((i) => i >= 0)

  if (currentIdx.length === 0) return stages.map(() => 'past')

  const first = Math.min(...currentIdx)
  const last = Math.max(...currentIdx)
  return stages.map((_, i) => (i < first ? 'past' : i > last ? 'upcoming' : 'current'))
}
