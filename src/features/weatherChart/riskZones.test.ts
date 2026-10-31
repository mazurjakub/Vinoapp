/**
 * File: riskZones.test.ts
 * Created: 2026-10-31
 * Description: Tests which days get a band in the Goidanich panel.
 */

import { describe, expect, it } from 'vitest'
import { goidanichBandRange } from './riskZones'

describe('goidanichBandRange', () => {
  it('draws nothing on a day below 90% or without a value', () => {
    expect(goidanichBandRange(13)).toBeNull()
    expect(goidanichBandRange(89.9)).toBeNull()
    expect(goidanichBandRange(null)).toBeNull()
  })

  it('draws only the near-end band from 90% to below 100%', () => {
    expect(goidanichBandRange(90)).toEqual([90, 100])
    expect(goidanichBandRange(99.9)).toEqual([90, 100])
  })

  it('adds the end band on a day that reached 100%', () => {
    expect(goidanichBandRange(100)).toEqual([90, 104])
    expect(goidanichBandRange(104.3)).toEqual([90, 104])
  })
})
