/**
 * File: harvestSummary.test.ts
 * Created: 2026-10-03
 * Description: Tests the yearly harvest summary calculations.
 */

import { describe, expect, it } from 'vitest'
import { summarizeHarvestsByYear } from './harvestSummary'
import type { Harvest } from '../../db/schema'

const now = new Date().toISOString()

function harvest(partial: Partial<Harvest> & { year: number; weightKg: number }): Harvest {
  return {
    vineyardId: 1,
    date: `${partial.year}-09-15`,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

describe('summarizeHarvestsByYear', () => {
  it('sums multiple harvests of the same year into one total', () => {
    const summaries = summarizeHarvestsByYear([
      harvest({ year: 2024, weightKg: 60 }),
      harvest({ year: 2024, weightKg: 40 }),
    ])
    expect(summaries[0].totalWeightKg).toBe(100)
  })

  it('computes weight change vs. the previous year', () => {
    const summaries = summarizeHarvestsByYear([
      harvest({ year: 2025, weightKg: 112 }),
      harvest({ year: 2024, weightKg: 100 }),
    ])
    expect(summaries[0].weightChangePct).toBeCloseTo(12)
  })

  it('omits the comparison when the previous year has no entries', () => {
    const summaries = summarizeHarvestsByYear([harvest({ year: 2025, weightKg: 100 })])
    expect(summaries[0].weightChangePct).toBeUndefined()
  })

  it('leaves avgSugar undefined when units are mixed within a year', () => {
    const summaries = summarizeHarvestsByYear([
      harvest({ year: 2024, weightKg: 50, sugar: 80, sugarUnit: 'Oe' }),
      harvest({ year: 2024, weightKg: 50, sugar: 18, sugarUnit: 'NM' }),
    ])
    expect(summaries[0].avgSugar).toBeUndefined()
    expect(summaries[0].sugarUnit).toBeUndefined()
  })

  it('flags a unit mismatch instead of computing a sugar change', () => {
    const summaries = summarizeHarvestsByYear([
      harvest({ year: 2025, weightKg: 100, sugar: 20, sugarUnit: 'NM' }),
      harvest({ year: 2024, weightKg: 100, sugar: 80, sugarUnit: 'Oe' }),
    ])
    expect(summaries[0].sugarChangePct).toBeUndefined()
    expect(summaries[0].sugarUnitMismatch).toBe(true)
  })
})
