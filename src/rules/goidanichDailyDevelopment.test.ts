/**
 * File: goidanichDailyDevelopment.test.ts
 * Created: 2026-10-02
 * Description: Tests the daily development lookup against the Goidanich table.
 */

import { describe, expect, it } from 'vitest'
import { goidanichDailyDevelopment } from './goidanichDailyDevelopment'
import goidanichTable from '../goidanich.json'

describe('goidanichDailyDevelopment - direct table lookups', () => {
  it('matches exact values from the table for a few spot checks', () => {
    // 13 °C, accumulated 25%, RH < 75 -> 5.7 (row 13, stage 25)
    expect(goidanichDailyDevelopment(13, 50, 25)).toBe(5.7)
    // 13 °C, accumulated 25%, RH >= 75 -> 7.7
    expect(goidanichDailyDevelopment(13, 90, 25)).toBe(7.7)
    // 20 °C, accumulated 75%, RH < 75 -> 15
    expect(goidanichDailyDevelopment(20, 60, 75)).toBe(15)
    // 20 °C, accumulated 75%, RH >= 75 -> 21.5
    expect(goidanichDailyDevelopment(20, 80, 75)).toBe(21.5)
  })

  it('uses the single constant row at and above 25 °C, regardless of accumulated bucket', () => {
    expect(goidanichDailyDevelopment(25, 50, 0)).toBe(16.6)
    expect(goidanichDailyDevelopment(25, 50, 75)).toBe(16.6)
    expect(goidanichDailyDevelopment(30, 90, 50)).toBe(22.2)
  })

  it('returns 0 below the table minimum of 12 °C', () => {
    expect(goidanichDailyDevelopment(11.9, 90, 0)).toBe(0)
    expect(goidanichDailyDevelopment(0, 90, 0)).toBe(0)
  })

  it('treats exactly the RH threshold (75%) as the high-humidity branch (boundary)', () => {
    expect(goidanichDailyDevelopment(15, 75, 0)).toBe(10.6) // rhGe75, not 7.6
  })
})

describe('goidanichDailyDevelopment - rounding choices (this app\'s own, not from the paper)', () => {
  it('rounds non-integer temperatures to the nearest whole degree', () => {
    expect(goidanichDailyDevelopment(13.4, 50, 0)).toBe(goidanichDailyDevelopment(13, 50, 0))
    expect(goidanichDailyDevelopment(13.6, 50, 0)).toBe(goidanichDailyDevelopment(14, 50, 0))
  })

  it('does not round temperatures just under 25 °C up into the constant row', () => {
    expect(goidanichDailyDevelopment(24.6, 50, 0)).toBe(goidanichDailyDevelopment(24, 50, 0))
  })

  it('picks the nearest accumulated-progress bucket', () => {
    expect(goidanichDailyDevelopment(13, 50, 24.9)).toBe(goidanichDailyDevelopment(13, 50, 0))
    expect(goidanichDailyDevelopment(13, 50, 49.9)).toBe(goidanichDailyDevelopment(13, 50, 25))
    expect(goidanichDailyDevelopment(13, 50, 50)).toBe(6)
    expect(goidanichDailyDevelopment(13, 50, 90)).toBe(goidanichDailyDevelopment(13, 50, 75)) // clamped to last stage
  })
})

describe('goidanichDailyDevelopment - suspicious cells are read verbatim (not "fixed")', () => {
  it('reproduces the three cells flagged in goidanich.json _notes exactly as transcribed', () => {
    expect(goidanichDailyDevelopment(12, 50, 0)).toBe(0) // flagged: neighbours ~4.4
    expect(goidanichDailyDevelopment(16, 50, 50)).toBe(6.3) // flagged: neighbours 9 / 9.6
    expect(goidanichDailyDevelopment(18, 90, 25)).toBe(15.2) // flagged: lower than 15.3 at bucket 0
  })

  it('still reflects whatever is in goidanich.json, so a future table edit is caught here', () => {
    const row16 = goidanichTable.rows.find((r) => r.tempC === 16)!
    const stage50 = row16.stages.find((s) => s.accumulatedPct === 50)!
    expect(goidanichDailyDevelopment(16, 50, 50)).toBe(stage50.rhLt75)
  })
})
