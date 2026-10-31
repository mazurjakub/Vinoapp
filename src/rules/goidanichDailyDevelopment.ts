/**
 * File: goidanichDailyDevelopment.ts
 * Created: 2026-10-02
 * Description: Looks up the daily Goidanich infection development in the table.
 */

import goidanichTable from '../goidanich.json'

interface GoidanichStage {
  accumulatedPct: number
  rhLt75: number
  rhGe75: number
}

interface GoidanichRow {
  tempC: number
  stages: GoidanichStage[]
}

interface GoidanichTable {
  constantFromTempC: number
  rhThresholdPct: number
  rows: GoidanichRow[]
}

const table = goidanichTable as GoidanichTable

/** The last stage already reached: 24.9% still uses 0, 25% uses 25, and everything from 75% uses 75. */
function reachedStage(stages: GoidanichStage[], accumulatedPct: number): GoidanichStage {
  const reached = Math.min(75, Math.floor(accumulatedPct / 25) * 25)
  return stages.find((stage) => stage.accumulatedPct === reached) ?? stages[0]
}

/**
 * Daily downy mildew secondary-infection development, per the Goidanich
 * table transcribed by hand into `goidanich.json` (Pérez-Expósito et al.
 * 2017, VineSens, Table 1 — see that file's `_source`/`_notes`, including
 * three cells flagged as possibly suspicious and left exactly as
 * transcribed; do not "fix" the table here).
 *
 * Returns the percentage of infection development added for one day. The
 * paper labels the temperature "Average Temperature" and explains neither the
 * rounding nor the 0/25/50/75 sub-rows, so these two choices are this app's own:
 *
 * - Row: the mean rounded to the nearest whole degree, halves up, with no
 *   interpolation (12.46 °C uses row 12, 12.65 °C uses row 13).
 * - Stage: `accumulatedPct` as it was before this day's addition, rounded down
 *   to a quarter, read as the stage already reached.
 *
 * Below the table's lowest temperature (12 °C) development is 0. From
 * `constantFromTempC` (25 °C) the paper states development is constant, so the
 * single row given for that case applies at any stage.
 */
export function goidanichDailyDevelopment(meanTempC: number, rhPct: number, accumulatedPct: number): number {
  const minTempC = table.rows[0].tempC
  if (meanTempC < minTempC) return 0

  const useHighHumidity = rhPct >= table.rhThresholdPct

  if (meanTempC >= table.constantFromTempC) {
    const constantRow = table.rows.find((r) => r.tempC === table.constantFromTempC)
    if (!constantRow) return 0
    const stage = constantRow.stages[0]
    return useHighHumidity ? stage.rhGe75 : stage.rhLt75
  }

  const roundedTemp = Math.min(table.constantFromTempC - 1, Math.max(minTempC, Math.round(meanTempC)))
  const row = table.rows.find((r) => r.tempC === roundedTemp)
  if (!row) return 0

  const stage = reachedStage(row.stages, accumulatedPct)
  return useHighHumidity ? stage.rhGe75 : stage.rhLt75
}
