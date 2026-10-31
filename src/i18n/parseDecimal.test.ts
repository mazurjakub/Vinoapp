/**
 * File: parseDecimal.test.ts
 * Created: 2026-10-31
 * Description: Tests reading typed decimal numbers and preparing stored ones for input fields.
 */

import { describe, expect, it } from 'vitest'
import { parseDecimal, toDecimalInput } from './parseDecimal'

describe('parseDecimal', () => {
  it('accepts a comma and a point', () => {
    expect(parseDecimal('8,8')).toBe(8.8)
    expect(parseDecimal('8.8')).toBe(8.8)
    expect(parseDecimal('48,900001')).toBe(48.900001)
  })

  it('accepts whole numbers, signs, spaces and shortened forms', () => {
    expect(parseDecimal('12')).toBe(12)
    expect(parseDecimal('-3,5')).toBe(-3.5)
    expect(parseDecimal('\u22123,5')).toBe(-3.5)
    expect(parseDecimal('1 234,5')).toBe(1234.5)
    expect(parseDecimal(',5')).toBe(0.5)
    expect(parseDecimal('8,')).toBe(8)
  })

  it('rejects anything that is not one number', () => {
    for (const text of ['', ' ', 'abc', '1,2,3', '1.234,5', '5 kg', ',', '-', '1e3']) {
      expect(parseDecimal(text)).toBeNull()
    }
  })
})

describe('toDecimalInput', () => {
  it('writes a stored number the way the language shows it', () => {
    expect(toDecimalInput(48.9, 'cs-CZ')).toBe('48,9')
    expect(toDecimalInput(48.9, 'en-GB')).toBe('48.9')
  })
})
