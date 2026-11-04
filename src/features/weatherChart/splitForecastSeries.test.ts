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

  it('preserves existing nulls (e.g. an inactive index) within each half', () => {
    const values = [null, 5, null, 8]
    const { measured, forecast } = splitForecastSeries(values, 2)
    expect(measured).toEqual([null, 5, null, null])
    expect(forecast).toEqual([null, 5, null, 8])
  })
})
