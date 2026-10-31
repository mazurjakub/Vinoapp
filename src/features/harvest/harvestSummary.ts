/**
 * File: harvestSummary.ts
 * Created: 2026-10-03
 * Description: Summarises harvests by year, with total weight, year-on-year change and average sugar.
 */

import type { Harvest, SugarUnit } from '../../db/schema'

export interface HarvestYearSummary {
  year: number
  totalWeightKg: number
  /** vs. the previous year's totalWeightKg; undefined if that year has no entries. */
  weightChangePct?: number
  avgSugar?: number
  sugarUnit?: SugarUnit
  sugarChangePct?: number
  /** Both years have sugar data, but in different units — no comparison is shown. */
  sugarUnitMismatch?: boolean
}

/** The unit sugar was recorded in for a year, or undefined if the year has none or mixed units. */
function uniformSugarUnit(harvests: Harvest[]): SugarUnit | undefined {
  const units = new Set(harvests.filter((h) => h.sugar !== undefined).map((h) => h.sugarUnit))
  return units.size === 1 ? [...units][0] : undefined
}

/** Summarizes a vineyard's harvests by year (newest first), with year-over-year comparisons. */
export function summarizeHarvestsByYear(harvests: Harvest[]): HarvestYearSummary[] {
  const byYear = new Map<number, Harvest[]>()
  for (const harvest of harvests) {
    const bucket = byYear.get(harvest.year)
    if (bucket) bucket.push(harvest)
    else byYear.set(harvest.year, [harvest])
  }

  const years = [...byYear.keys()].sort((a, b) => b - a)

  return years.map((year) => {
    const entries = byYear.get(year)!
    const prevEntries = byYear.get(year - 1)
    const totalWeightKg = entries.reduce((sum, h) => sum + h.weightKg, 0)

    const sugarUnit = uniformSugarUnit(entries)
    const sugarValues = entries.filter((h) => h.sugar !== undefined).map((h) => h.sugar!)
    const avgSugar = sugarUnit && sugarValues.length > 0
      ? sugarValues.reduce((a, b) => a + b, 0) / sugarValues.length
      : undefined

    const summary: HarvestYearSummary = { year, totalWeightKg, avgSugar, sugarUnit }

    if (prevEntries) {
      const prevTotalWeightKg = prevEntries.reduce((sum, h) => sum + h.weightKg, 0)
      if (prevTotalWeightKg > 0) {
        summary.weightChangePct = ((totalWeightKg - prevTotalWeightKg) / prevTotalWeightKg) * 100
      }

      const prevSugarUnit = uniformSugarUnit(prevEntries)
      const prevSugarValues = prevEntries.filter((h) => h.sugar !== undefined).map((h) => h.sugar!)
      const prevAvgSugar = prevSugarUnit && prevSugarValues.length > 0
        ? prevSugarValues.reduce((a, b) => a + b, 0) / prevSugarValues.length
        : undefined

      if (avgSugar !== undefined && prevAvgSugar !== undefined) {
        if (sugarUnit === prevSugarUnit) {
          summary.sugarChangePct = ((avgSugar - prevAvgSugar) / prevAvgSugar) * 100
        } else {
          summary.sugarUnitMismatch = true
        }
      }
    }

    return summary
  })
}
