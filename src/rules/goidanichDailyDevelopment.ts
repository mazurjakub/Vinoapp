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

/** The table's lowest temperature. A day with a mean below it adds no development; at it, the row applies. */
export const GOIDANICH_TABLE_MIN_TEMP_C = Math.min(...table.rows.map((r) => r.tempC))

/**
 * Which table row a daily mean uses: `null` below the table (no development),
 * otherwise the row's temperature. The raw mean decides the two edges; in
 * between it is rounded to the nearest degree, halves up:
 *
 * - below 12.0 °C: no row (11.9 °C adds nothing, although it would round to 12)
 * - 12.0–12.49 °C: row 12; 12.5 °C: row 13
 * - 24.5–24.99 °C: row 24 (rounding would give 25, but the constant row only applies from 25.0 °C)
 * - from 25.0 °C: the constant row 25
 */
export function goidanichTableRowTempC(meanTempC: number): number | null {
  if (meanTempC < GOIDANICH_TABLE_MIN_TEMP_C) return null
  if (meanTempC >= table.constantFromTempC) return table.constantFromTempC
  return Math.min(table.constantFromTempC - 1, Math.max(GOIDANICH_TABLE_MIN_TEMP_C, Math.round(meanTempC)))
}

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
 * Below the table's lowest temperature (12 °C) development is 0; a mean of
 * exactly 12.0 °C uses row 12 (see `goidanichTableRowTempC`). From
 * `constantFromTempC` (25 °C) the paper states development is constant, so the
 * single row given for that case applies at any stage.
 */
export function goidanichDailyDevelopment(meanTempC: number, rhPct: number, accumulatedPct: number): number {
  const rowTempC = goidanichTableRowTempC(meanTempC)
  if (rowTempC === null) return 0
  const row = table.rows.find((r) => r.tempC === rowTempC)
  if (!row) return 0

  const useHighHumidity = rhPct >= table.rhThresholdPct
  const stage = rowTempC === table.constantFromTempC ? row.stages[0] : reachedStage(row.stages, accumulatedPct)
  return useHighHumidity ? stage.rhGe75 : stage.rhLt75
}
