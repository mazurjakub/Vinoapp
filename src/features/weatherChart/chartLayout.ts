/**
 * File: chartLayout.ts
 * Created: 2026-10-20
 * Description: Date helpers that locate the forecast boundary in the weather chart.
 */

/**
 * Index of the first date strictly after `today` (the first *future* day),
 * or -1 if every date in `dates` is on or before it. Deliberately based on
 * the calendar date, not a per-point `source` tag — a day's `source` can
 * default to `'forecast'` before its snapshot/sync has caught up (see
 * `weatherSeries.ts`), which must never shift where the forecast band starts.
 */
export function forecastBoundaryIndex(dates: string[], today: string): number {
  return dates.findIndex((d) => d > today)
}

/**
 * Whether `date` should be labelled "forecast" in the UI — strictly after
 * `today`, never based on a row's `source` tag (which can default to
 * `'forecast'` before a day's snapshot/sync has caught up — see
 * `weatherSeries.ts` — and would otherwise mislabel an already-elapsed day
 * like yesterday as a forecast).
 */
export function isForecastDate(date: string, today: string): boolean {
  return date > today
}
