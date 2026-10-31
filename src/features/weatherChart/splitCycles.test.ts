/**
 * File: splitCycles.test.ts
 * Created: 2026-10-31
 * Description: Tests breaking the Goidanich line between one cycle and the next.
 */

import { describe, expect, it } from 'vitest'
import { isLonePoint, splitCycles } from './splitForecastSeries'

describe('splitCycles', () => {
  it('keeps one rising cycle in one series', () => {
    expect(splitCycles([10, 20, 20, 30])).toEqual([[10, 20, 20, 30], [null, null, null, null]])
  })

  it('separates a new cycle that starts the day after the previous one ended', () => {
    expect(splitCycles([95, 101, 5, 11])).toEqual([[95, 101, null, null], [null, null, 5, 11]])
  })

  it('leaves the gap when days without a value lie between two cycles', () => {
    expect(splitCycles([95, 101, null, 5])).toEqual([[95, 101, null, 5], [null, null, null, null]])
  })
})

describe('isLonePoint', () => {
  it('finds a day without neighbours, in history or in the forecast', () => {
    expect(isLonePoint([null, 5, null], 1)).toBe(true)
    expect(isLonePoint([null, null, null, 5, null], 3, 2)).toBe(true)
    expect(isLonePoint([5, 6, null], 1)).toBe(false)
    expect(isLonePoint([null, null, null], 1)).toBe(false)
  })

  it('ignores the last history day at the start of a forecast series', () => {
    expect(isLonePoint([null, 5, null, null], 1, 2)).toBe(false)
  })
})
