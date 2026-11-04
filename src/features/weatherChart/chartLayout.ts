/**
 * File: chartLayout.ts
 * Created: 2026-10-20
 * Description: Date helpers that locate the forecast boundary in the weather chart.
 */

/** Index of the first day after today, or -1. Based on the date, not on `source`, which can lag behind. */
export function forecastBoundaryIndex(dates: string[], today: string): number {
  return dates.findIndex((d) => d > today)
}

export function isForecastDate(date: string, today: string): boolean {
  return date > today
}
