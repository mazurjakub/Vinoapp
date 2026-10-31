/**
 * File: settingsClassification.ts
 * Created: 2026-10-20
 * Description: Classifies settings keys as user or derived, which decides what is exported and imported.
 */

import { SETTINGS_KEYS } from './settingsKeys'

/** Settings keys a user can actually set — the export whitelist (`features/data/exportRepo.ts`). */
export const USER_SETTINGS_KEYS: ReadonlySet<string> = new Set(Object.values(SETTINGS_KEYS))

/**
 * Prefixes of settings keys holding state derived from weather and rules
 * (see `features/risk/syncSeasonState.ts` / `dailyAccumulator.ts`) — never
 * exported (`exportRepo.ts`), always stripped on import (`importRepo.ts`).
 */
export const DERIVED_SETTINGS_KEY_PATTERN = /^(degreeSum|goidanichState|gublerThomasState|daySource|lastSeasonSync):/

export type SettingsKeyClass = 'user' | 'derived' | 'unknown'

/**
 * Classifies a `settings` row's key. `'unknown'` means neither this file nor
 * `exportRepo.ts`/`importRepo.ts` recognizes it — see
 * `settingsClassification.test.ts`, which fails if the app ever writes such
 * a key without this file being updated to classify it.
 */
export function classifySettingsKey(key: string): SettingsKeyClass {
  if (USER_SETTINGS_KEYS.has(key)) return 'user'
  if (DERIVED_SETTINGS_KEY_PATTERN.test(key)) return 'derived'
  return 'unknown'
}
