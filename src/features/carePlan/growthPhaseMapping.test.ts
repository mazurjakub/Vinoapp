/**
 * File: growthPhaseMapping.test.ts
 * Created: 2026-10-03
 * Description: Tests the mapping from growth stages and inspections to care plan rows.
 */

import { describe, expect, it } from 'vitest'
import carePlanRaw from '../../data/carePlan.cz-bio.json'
import { parseCarePlan } from './carePlanSchema'
import { inspectionRowIndex, pickCurrentPhase, rowStatuses, type GrowthStageEntry } from './growthPhaseMapping'

const plan = parseCarePlan(carePlanRaw)
const stages = plan.stages

describe('inspectionRowIndex', () => {
  it('attaches every inspection to a stage row', () => {
    for (const c of plan.inspections ?? []) {
      expect(inspectionRowIndex(c, stages)).toBeGreaterThanOrEqual(0)
    }
  })

})

// Row order in the file: 0:❶ 1:❷moths 2:❷powdery mildew 3:❷red fire 4:❸ 5:❹ 6:❺ 7:❻ 8:❼ 9:❽
const at = (statuses: string[], ...indices: number[]) => indices.map((i) => statuses[i])

describe('rowStatuses', () => {
  it('before any growth stage, ❶ is current and everything else is upcoming', () => {
    const s = rowStatuses(stages, 'none')
    expect(s[0]).toBe('current')
    expect(s.slice(1).every((x) => x === 'upcoming')).toBe(true)
  })

  it('flowering marks ❸, ❹, ❺ as current and ❻, ❼, ❽ as upcoming', () => {
    const s = rowStatuses(stages, 'flowering')
    expect(at(s, 4, 5, 6)).toEqual(['current', 'current', 'current'])
    expect(at(s, 7, 8, 9)).toEqual(['upcoming', 'upcoming', 'upcoming'])
    expect(at(s, 0, 1, 2, 3)).toEqual(['past', 'past', 'past', 'past'])
  })

  it('ripening and harvest leave no current row: the whole plan is past', () => {
    expect(rowStatuses(stages, 'ripening').every((x) => x === 'past')).toBe(true)
    expect(rowStatuses(stages, 'harvest').every((x) => x === 'past')).toBe(true)
  })
})

describe('pickCurrentPhase', () => {
  const entries: GrowthStageEntry[] = [
    { stage: 'budbreak', date: '2026-04-10', year: 2026 },
    { stage: 'shoot10cm', date: '2026-05-05', year: 2026 },
    { stage: 'flowering', date: '2026-06-01', year: 2026 },
    { stage: 'budbreak', date: '2025-04-12', year: 2025 },
  ]

  it('returns none when nothing is recorded for the season', () => {
    expect(pickCurrentPhase([], '2026-07-01', 2026)).toBe('none')
  })

  it('picks the latest record on or before today, ignoring other seasons', () => {
    expect(pickCurrentPhase(entries, '2026-05-20', 2026)).toBe('shoot10cm')
    expect(pickCurrentPhase(entries, '2026-07-01', 2026)).toBe('flowering')
  })
})
