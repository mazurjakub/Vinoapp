/**
 * File: riskZones.ts
 * Created: 2026-10-20
 * Description: Thresholds and zones of the Goidanich and Gubler-Thomas chart panels.
 */

import { URGENT_THRESHOLD_PCT, WARNING_THRESHOLD_PCT, scoreToRisk } from '../../rules'

export const gublerRiskForScore = scoreToRisk

/** Boundaries of the published bands: low up to 30, medium from 40, high from 60. */
export const GUBLER_THRESHOLDS = {
  lowTo: 30,
  mediumFrom: 40,
  highFrom: 60,
} as const

export const GOIDANICH_ZONES = {
  warning: WARNING_THRESHOLD_PCT,
  urgent: URGENT_THRESHOLD_PCT,
} as const

/** Only a thin band: reaching 100% ends a cycle, it isn't an alarm for the whole panel. */
export const GOIDANICH_END_BAND_PCT = 4

/** The band for one day's index as [from, to], or `null` on a day the index never reached the warning. */
export function goidanichBandRange(pct: number | null): [number, number] | null {
  if (pct === null || pct < GOIDANICH_ZONES.warning) return null
  return [GOIDANICH_ZONES.warning, pct >= GOIDANICH_ZONES.urgent ? GOIDANICH_ZONES.urgent + GOIDANICH_END_BAND_PCT : GOIDANICH_ZONES.urgent]
}
