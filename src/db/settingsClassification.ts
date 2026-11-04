/**
 * File: settingsClassification.ts
 * Created: 2026-10-20
 * Description: Classifies settings keys as user or derived, which decides what is exported and imported.
 */

import { SETTINGS_KEYS } from './settingsKeys'

/** Settings the user can change, only these get exported. */
export const USER_SETTINGS_KEYS: ReadonlySet<string> = new Set(Object.values(SETTINGS_KEYS))

/** Derived state from the season sync, never exported or imported. */
export const DERIVED_SETTINGS_KEY_PATTERN = /^(degreeSum|goidanichState|gublerThomasState|daySource|lastSeasonSync):/

export type SettingsKeyClass = 'user' | 'derived' | 'unknown'

export function classifySettingsKey(key: string): SettingsKeyClass {
  if (USER_SETTINGS_KEYS.has(key)) return 'user'
  if (DERIVED_SETTINGS_KEY_PATTERN.test(key)) return 'derived'
  return 'unknown'
}
