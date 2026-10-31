/**
 * File: incubation.test.ts
 * Created: 2026-10-02
 * Description: Tests the incubation period at the anchor temperatures and outside their range.
 */

import { describe, expect, it } from 'vitest'
import { incubationDays } from './incubation'

describe('incubationDays', () => {
  it('matches the anchor points', () => {
    expect(incubationDays(14)).toBe(10)
    expect(incubationDays(18)).toBe(6)
    expect(incubationDays(24)).toBe(4)
  })

  it('clamps outside the given range', () => {
    expect(incubationDays(5)).toBe(10)
    expect(incubationDays(30)).toBe(4)
  })

  it('interpolates linearly between anchors', () => {
    expect(incubationDays(16)).toBeCloseTo(8) // midpoint of 14->10d and 18->6d
  })
})
