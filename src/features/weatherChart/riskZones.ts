/**
 * File: riskZones.ts
 * Created: 2026-10-20
 * Description: Thresholds of the Gubler-Thomas chart panel. The Goidanich thresholds come from the region profile.
 */

import { scoreToRisk } from '../../rules'

export const gublerRiskForScore = scoreToRisk

/** Boundaries of the published bands: low up to 30, medium from 40, high from 60. */
export const GUBLER_THRESHOLDS = {
  lowTo: 30,
  mediumFrom: 40,
  highFrom: 60,
} as const
