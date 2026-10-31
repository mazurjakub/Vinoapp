/**
 * File: splitForecastSeries.test.ts
 * Created: 2026-10-20
 * Description: Tests splitting a chart series into measured and forecast parts.
 */

import { describe, expect, it } from 'vitest'
import { splitForecastSeries } from './splitForecastSeries'

describe('splitForecastSeries', () => {
  it('splits at the boundary, sharing exactly the last-measured point so the lines connect', () => {
    const values = [1, 2, 3, 4, 5]
    const { measured, forecast } = splitForecastSeries(values, 3)
    expect(measured).toEqual([1, 2, 3, null, null])
    expect(forecast).toEqual([null, null, 3, 4, 5])
  })

  it('never draws the same segment twice: the junction value appears once per array, not duplicated as two distinct segments', () => {
    const values = [10, 20, 30]
    const { measured, forecast } = splitForecastSeries(values, 1)
    // measured ends at index 0, forecast starts at index 0 — one shared point, one real segment each side
    expect(measured).toEqual([10, null, null])
    expect(forecast).toEqual([10, 20, 30])
  })

  it('puts everything in "forecast" when the first point is already in the future', () => {
    const values = [1, 2, 3]
    const { measured, forecast } = splitForecastSeries(values, 0)
    expect(measured).toEqual([null, null, null])
    expect(forecast).toEqual([1, 2, 3])
  })

  it('puts everything in "measured" when there are no forecast days at all', () => {
    const values = [1, 2, 3]
    const { measured, forecast } = splitForecastSeries(values, -1)
    expect(measured).toEqual([1, 2, 3])
    expect(forecast).toEqual([null, null, null])
  })

  it('preserves existing nulls (e.g. an inactive index) within each half', () => {
    const values = [null, 5, null, 8]
    const { measured, forecast } = splitForecastSeries(values, 2)
    expect(measured).toEqual([null, 5, null, null])
    expect(forecast).toEqual([null, 5, null, 8])
  })
})
