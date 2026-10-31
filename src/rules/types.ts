/**
 * File: types.ts
 * Created: 2026-10-02
 * Description: Shared types of the rule engine, such as risk levels and results.
 */

export type Risk = 'low' | 'medium' | 'high'

/** Translation key with its values, so the rule engine stays independent of the UI language. */
export interface RiskReason {
  key: string
  params?: Record<string, string | number>
  /** YYYY-MM-DD values, formatted for the current language when the text is built. */
  dates?: Record<string, string>
  /** Translated separately and passed to `key` as the comma-joined `conditions` value. */
  conditions?: RiskReason[]
}

export interface RiskResult {
  date: string // YYYY-MM-DD
  risk: Risk
  reasons: RiskReason[]
  rule: string
  /** Citation of the rule's origin. */
  source: string
}

/** Known phenology dates for a vineyard in a single season, YYYY-MM-DD. */
export interface PhenologyDates {
  budbreak?: string
  flowering?: string
  veraison?: string
  ripening?: string
  harvest?: string
  /** Date the shoot reached ~10 cm. Only used by the eu-generic 3-10 rule. */
  shoot10cm?: string
}
