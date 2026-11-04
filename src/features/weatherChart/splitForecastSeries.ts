/**
 * File: splitForecastSeries.ts
 * Created: 2026-10-20
 * Description: Splits a series into measured and forecast parts so the chart can draw them differently.
 */

/**
 * Splits a series into measured and forecast parts, so the forecast can be dashed.
 * Both parts share the last measured point, so the line stays continuous.
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

/** One series per Goidanich cycle, so the line breaks where a new cycle starts. */
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
