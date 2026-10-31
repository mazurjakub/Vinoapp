/**
 * File: settingsKeys.ts
 * Created: 2026-10-03
 * Description: Names and default values of the user settings.
 */

import type { SugarUnit } from './schema'

export const SETTINGS_KEYS = {
  selectedVineyardId: 'selectedVineyardId',
  sprayWarningDays: 'sprayWarningDays',
  sugarUnit: 'sugarUnit',
} as const

export type { SugarUnit }

export const DEFAULT_SPRAY_WARNING_DAYS = 10
export const DEFAULT_SUGAR_UNIT: SugarUnit = 'NM'
