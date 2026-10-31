/**
 * File: riskReasonText.ts
 * Created: 2026-10-31
 * Description: Turns the translation keys returned by the rule engine into text in the current language.
 */

import { formatNumber } from '../../i18n/formatNumber'
import type { RiskReason } from '../../rules'

type Translate = (key: string, options?: Record<string, unknown>) => string

/** The rules hand over numbers as plain values or as strings already rounded, e.g. "8.8". */
function localizeParam(value: unknown, locale: string): unknown {
  if (typeof value === 'number') return formatNumber(value, locale)
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
    return formatNumber(Number(value), locale, value.split('.')[1]?.length ?? 0)
  }
  return value
}

export function formatRiskReason(t: Translate, reason: RiskReason, locale = 'cs-CZ'): string {
  const conditions = reason.conditions?.map((condition) => formatRiskReason(t, condition, locale)).join(', ')
  const dates = Object.fromEntries(
    Object.entries(reason.dates ?? {}).map(([name, date]) => [
      name,
      new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }),
    ]),
  )
  const params = Object.fromEntries(
    Object.entries(reason.params ?? {}).map(([name, value]) => [name, localizeParam(value, locale)]),
  )
  return t(reason.key, { ...params, ...dates, conditions })
}
