/**
 * File: chartLayout.test.ts
 * Created: 2026-10-20
 * Description: Tests where the forecast part of the chart starts.
 */

import { describe, expect, it } from 'vitest'
import { forecastBoundaryIndex, isForecastDate } from './chartLayout'

describe('forecastBoundaryIndex', () => {
  it('finds the first future day (points.length window, 7 back + today + 7 forward)', () => {
    const dates = ['2026-06-13', '2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17']
    expect(forecastBoundaryIndex(dates, '2026-06-15')).toBe(3) // 06-16 is the first date > today
  })

  it('returns -1 when every date is on or before today (no forecast days in view)', () => {
    const dates = ['2026-06-13', '2026-06-14', '2026-06-15']
    expect(forecastBoundaryIndex(dates, '2026-06-15')).toBe(-1)
  })

  it('returns 0 when every date is already in the future', () => {
    const dates = ['2026-06-16', '2026-06-17']
    expect(forecastBoundaryIndex(dates, '2026-06-15')).toBe(0)
  })

  it('treats today itself as not future — the boundary is strictly after it', () => {
    expect(forecastBoundaryIndex(['2026-06-15'], '2026-06-15')).toBe(-1)
  })
})

describe('isForecastDate', () => {
  it('is true only strictly after today', () => {
    expect(isForecastDate('2026-10-21', '2026-10-20')).toBe(true)
    expect(isForecastDate('2026-10-20', '2026-10-20')).toBe(false)
    expect(isForecastDate('2026-10-16', '2026-10-20')).toBe(false)
  })
})
