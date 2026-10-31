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
  const byId = (id: string) => {
    const found = (plan.inspections ?? []).find((c) => c.id === id)
    if (!found) throw new Error(`missing inspection ${id}`)
    return found
  }

  it('attaches every inspection to a stage row', () => {
    for (const c of plan.inspections ?? []) {
      expect(inspectionRowIndex(c, stages)).toBeGreaterThanOrEqual(0)
    }
  })

  it('places the checks at the stage they belong to', () => {
    expect(inspectionRowIndex(byId('phomopsis_b'), stages)).toBe(0) // ❶ row, BBCH 01
    expect(inspectionRowIndex(byId('powdery_e'), stages)).toBe(2) // ❷ powdery mildew row, BBCH 13
    expect(inspectionRowIndex(byId('moth_generation_1'), stages)).toBe(5) // ❹, BBCH 57
    expect(inspectionRowIndex(byId('moth_generation_2'), stages)).toBe(7) // ❻, BBCH 73
    expect(inspectionRowIndex(byId('mites_calepitrimerus_late'), stages)).toBe(9) // ❽, BBCH 81
    expect(inspectionRowIndex(byId('spider_mite_panonychus_dormant'), stages)).toBe(0) // ❶, pruning
    expect(inspectionRowIndex(byId('spider_mite_panonychus_leaves'), stages)).toBe(2) // ❷, E 13
  })

  it('falls back to the last earlier stage when no row starts inside the range', () => {
    // I (65) has no row of its own; the nearest earlier row is ❹ (57).
    expect(inspectionRowIndex(byId('leafhopper_generation_1'), stages)).toBe(5)
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

  it('budbreak marks the moth row (09) as current', () => {
    const s = rowStatuses(stages, 'budbreak')
    expect(s[1]).toBe('current')
    expect(s[0]).toBe('past')
    expect(s[2]).toBe('upcoming')
  })

  it('shoot10cm marks both 3–4 leaf rows (13) as current', () => {
    const s = rowStatuses(stages, 'shoot10cm')
    expect(at(s, 2, 3)).toEqual(['current', 'current'])
    expect(at(s, 0, 1)).toEqual(['past', 'past'])
    expect(s[4]).toBe('upcoming')
  })

  it('flowering marks ❸, ❹, ❺ as current and ❻, ❼, ❽ as upcoming', () => {
    const s = rowStatuses(stages, 'flowering')
    expect(at(s, 4, 5, 6)).toEqual(['current', 'current', 'current'])
    expect(at(s, 7, 8, 9)).toEqual(['upcoming', 'upcoming', 'upcoming'])
    expect(at(s, 0, 1, 2, 3)).toEqual(['past', 'past', 'past', 'past'])
  })

  it('veraison marks ❽ as current and everything before as past', () => {
    const s = rowStatuses(stages, 'veraison')
    expect(s[9]).toBe('current')
    expect(s.slice(0, 9).every((x) => x === 'past')).toBe(true)
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

  it('returns none when every record of the season is in the future', () => {
    expect(pickCurrentPhase(entries, '2026-03-01', 2026)).toBe('none')
  })

  it('picks the latest record on or before today, ignoring other seasons', () => {
    expect(pickCurrentPhase(entries, '2026-05-20', 2026)).toBe('shoot10cm')
    expect(pickCurrentPhase(entries, '2026-07-01', 2026)).toBe('flowering')
  })

  it('breaks same-day ties by stage order', () => {
    const sameDay: GrowthStageEntry[] = [
      { stage: 'flowering', date: '2026-06-01', year: 2026 },
      { stage: 'shoot10cm', date: '2026-06-01', year: 2026 },
    ]
    expect(pickCurrentPhase(sameDay, '2026-06-01', 2026)).toBe('flowering')
  })
})
