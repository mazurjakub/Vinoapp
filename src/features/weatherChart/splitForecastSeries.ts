/**
 * File: splitForecastSeries.ts
 * Created: 2026-10-20
 * Description: Splits a series into measured and forecast parts so the chart can draw them differently.
 */

/**
 * Splits one series of values into a "measured" and a "forecast" half for
 * Recharts, so the same line can render solid up to today and dashed only
 * for the forecast part (Recharts has no per-segment dash, so this is the
 * standard two-overlapping-series trick). The two series share exactly one
 * point — the last measured index — so the line is visually continuous with
 * no gap and no doubly-drawn segment.
 */
export interface SplitSeries {
  measured: (number | null)[]
  forecast: (number | null)[]
}

export function splitForecastSeries(values: (number | null)[], boundaryIndex: number): SplitSeries {
  if (boundaryIndex === -1) {
    return { measured: values, forecast: values.map(() => null) }
  }
  const junction = boundaryIndex - 1
  return {
    measured: values.map((v, i) => (i <= junction ? v : null)),
    forecast: values.map((v, i) => (i >= junction ? v : null)),
  }
}

/**
 * Splits a Goidanich series into two alternating series, one per cycle. The
 * percentage never falls within a cycle, so a fall between adjacent days means a
 * new cycle started right after the previous one ended, and the line must break there.
 */
export function splitCycles(values: (number | null)[]): [(number | null)[], (number | null)[]] {
  const first: (number | null)[] = values.map(() => null)
  const second: (number | null)[] = values.map(() => null)
  let target = first
  values.forEach((value, i) => {
    const previous = values[i - 1]
    if (value !== null && previous !== null && previous !== undefined && value < previous) {
      target = target === first ? second : first
    }
    target[i] = value
  })
  return [first, second]
}

/**
 * Whether a point has no neighbours to draw a line to. A forecast series starts
 * on the last history day to join the line up, so that day isn't its own:
 * `firstOwnIndex` leaves it out.
 */
export function isLonePoint(values: (number | null)[], index: number, firstOwnIndex = 0): boolean {
  const hasValue = (i: number) => values[i] !== null && values[i] !== undefined
  return index >= firstOwnIndex && hasValue(index) && !hasValue(index - 1) && !hasValue(index + 1)
}
