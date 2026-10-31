/**
 * File: formatNumber.test.ts
 * Created: 2026-10-31
 * Description: Tests number formatting in Czech and English.
 */

import { describe, expect, it } from 'vitest'
import cs from './locales/cs.json'
import en from './locales/en.json'
import { formatNumber, formatWithUnit } from './formatNumber'

describe('formatNumber', () => {
  it('uses a decimal comma in Czech and a point in English', () => {
    expect(formatNumber(8.8, 'cs-CZ', 1)).toBe('8,8')
    expect(formatNumber(8.8, 'en-GB', 1)).toBe('8.8')
  })

  it('keeps the requested number of decimals', () => {
    expect(formatNumber(11, 'cs-CZ', 1)).toBe('11,0')
    expect(formatNumber(94.6, 'cs-CZ', 0)).toBe('95')
  })

  it('does not show a negative zero', () => {
    expect(formatNumber(-0.04, 'cs-CZ', 1)).toBe('0,0')
  })

  it('leaves whole numbers without decimals when none are requested', () => {
    expect(formatNumber(25, 'cs-CZ')).toBe('25')
  })
})

describe('formatWithUnit', () => {
  it('joins the number and unit with a non-breaking space', () => {
    expect(formatWithUnit(13, '%', 'cs-CZ', 0)).toBe('13\u00a0%')
    expect(formatWithUnit(8.8, '°C', 'cs-CZ', 1)).toBe('8,8\u00a0°C')
    expect(formatWithUnit(1.5, 'kg', 'en-GB', 1)).toBe('1.5\u00a0kg')
  })
})

describe.each([
  ['cs', cs],
  ['en', en],
])('%s texts', (_language, texts) => {
  it('never leave a breakable space between a number and its unit', () => {
    expect(JSON.stringify(texts)).not.toMatch(/(\d|\}\}) (°C|%|mm|kg|cm)(?![a-zA-Z])/)
  })
})
