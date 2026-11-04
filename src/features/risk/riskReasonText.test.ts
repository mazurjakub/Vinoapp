/**
 * File: riskReasonText.test.ts
 * Created: 2026-10-31
 * Description: Tests that risk reasons from every rule read correctly in Czech and English.
 */

import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'
import { DEFAULT_GOIDANICH_THRESHOLDS } from '../../rules'
import cs from '../../i18n/locales/cs.json'
import en from '../../i18n/locales/en.json'
import {
  downyMildewPrimaryRisk,
  goidanichSecondaryRisk,
  powderyMildewGublerThomasRisk,
  REGION_PROFILES,
  type RiskReason,
} from '../../rules'
import { makeDay } from '../../rules/testUtils'
import { formatRiskReason } from './riskReasonText'

const i18n = createInstance()
void i18n.init({
  resources: { cs: { translation: cs }, en: { translation: en } },
  lng: 'cs',
  interpolation: { escapeValue: false },
})

const rainyDay = makeDay('2026-05-01', () => ({ temperature2m: 15, precipitation: 10 }))
const hotDay = makeDay('2026-07-01', (hour) => ({ temperature2m: hour < 10 ? 25 : 36 }))
const coldDay = makeDay('2026-05-02', () => ({ temperature2m: 2 }))

const warmDays = Array.from({ length: 12 }, (_, i) =>
  makeDay(`2026-06-${String(i + 1).padStart(2, '0')}`, () => ({ temperature2m: 25, relativeHumidity2m: 90 })),
).flat()
const coldDays = Array.from({ length: 3 }, (_, i) =>
  makeDay(`2026-09-0${i + 1}`, () => ({ temperature2m: 5, relativeHumidity2m: 90 })),
).flat()

const reasons: RiskReason[] = [
  ...downyMildewPrimaryRisk(rainyDay, {}, REGION_PROFILES['cz-morava'], 200).flatMap((r) => r.reasons),
  ...downyMildewPrimaryRisk(rainyDay, { shoot10cm: '2026-04-01' }, REGION_PROFILES['eu-generic']).flatMap((r) => r.reasons),
  ...downyMildewPrimaryRisk(coldDay, {}, REGION_PROFILES['eu-generic']).flatMap((r) => r.reasons),
  ...powderyMildewGublerThomasRisk([...hotDay, ...coldDay]).flatMap((r) => r.reasons),
  ...goidanichSecondaryRisk(warmDays, '2026-06-01', undefined, {
    primaryEventDates: new Set(['2026-06-01']),
    stallDays: 21, thresholds: DEFAULT_GOIDANICH_THRESHOLDS,
    newInfectionDates: new Set(['2026-06-02']),
  }).flatMap((r) => r.reasons),
  ...goidanichSecondaryRisk(coldDays, '2026-09-01', undefined, {
    primaryEventDates: new Set(['2026-09-01']),
    stallDays: 2, thresholds: DEFAULT_GOIDANICH_THRESHOLDS,
  }).flatMap((r) => r.reasons),
  ...goidanichSecondaryRisk(coldDays, '2026-09-01', undefined, {
    primaryEventDates: new Set(),
    stallDays: 2, thresholds: DEFAULT_GOIDANICH_THRESHOLDS,
  }).flatMap((r) => r.reasons),
]

describe.each(['cs', 'en'])('formatRiskReason in %s', (language) => {
  const t = i18n.getFixedT(language) as (key: string, options?: Record<string, unknown>) => string

  it('leaves no raw keys or unfilled values', () => {
    for (const reason of reasons) {
      const text = formatRiskReason(t, reason)
      expect(text).not.toMatch(/riskReasons\.|\{\{/)
    }
  })
})

describe('formatRiskReason', () => {
  it('formats dates for the selected language', () => {
    const reason: RiskReason = {
      key: 'riskReasons.goidanichRunning',
      params: { pct: '95' },
      dates: { start: '2026-09-12' },
    }
    const translate = (language: string, locale: string) =>
      formatRiskReason(i18n.getFixedT(language) as (key: string, options?: Record<string, unknown>) => string, reason, locale)

    expect(translate('cs', 'cs-CZ')).toMatch(/12\. ?9\..*95\u00a0%/)
    expect(translate('en', 'en-GB')).toMatch(/12\/09.*95%/)
  })

  it('formats numbers from the rules for the selected language', () => {
    const reason: RiskReason = { key: 'riskReasons.goidanichTooCold', params: { temperature: '8.8', min: 12 } }
    const translate = (language: string, locale: string) =>
      formatRiskReason(i18n.getFixedT(language) as (key: string, options?: Record<string, unknown>) => string, reason, locale)

    expect(translate('cs', 'cs-CZ')).toContain('8,8\u00a0°C je pod 12\u00a0°C')
    expect(translate('en', 'en-GB')).toContain('8.8\u00a0°C is below 12\u00a0°C')
  })

  it('joins conditions into the sentence in the selected language', () => {
    const reason: RiskReason = {
      key: 'riskReasons.primaryMet',
      params: { profile: 'cz-morava' },
      conditions: [
        { key: 'riskReasons.temperature', params: { min: 10 } },
        { key: 'riskReasons.shootLength' },
      ],
    }
    const translate = (language: string) =>
      formatRiskReason(i18n.getFixedT(language) as (key: string, options?: Record<string, unknown>) => string, reason)

    expect(translate('cs')).toBe('Primární infekce (cz-morava): teplota ≥ 10\u00a0°C, letorost už dosáhl 10\u00a0cm.')
    expect(translate('en')).toBe('Primary infection (cz-morava): temperature ≥ 10\u00a0°C, the shoot has reached 10\u00a0cm.')
  })
})
