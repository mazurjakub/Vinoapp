/**
 * File: downyMildewPrimary.test.ts
 * Created: 2026-10-02
 * Description: Tests the primary downy mildew rule against synthetic weather and boundary values.
 */

import { describe, expect, it } from 'vitest'
import { countPrimaryInfectionEvents, downyMildewPrimaryRisk } from './downyMildewPrimary'
import { REGION_PROFILES } from './regionProfiles'
import { makeDay } from '../test/testUtils'
import type { HourlyWeather } from '../db/schema'
import type { RiskResult } from './types'

const BUDBREAK = '2026-04-01'
const TARGET = '2026-04-20' // 20 days of accumulation at +10 DS/day = 200 DS >= 170

function seasonHours(targetOverrides: (hour: number) => Partial<HourlyWeather>): HourlyWeather[] {
  const hours: HourlyWeather[] = []
  const [sy, sm, sd] = BUDBREAK.split('-').map(Number)
  const [ey, em, ed] = TARGET.split('-').map(Number)
  const start = Date.UTC(sy, sm - 1, sd)
  const end = Date.UTC(ey, em - 1, ed)
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    const date = new Date(t).toISOString().slice(0, 10)
    const isTarget = date === TARGET
    hours.push(...makeDay(date, isTarget ? targetOverrides : () => ({ temperature2m: 18 })))
  }
  return hours
}

describe('downyMildewPrimaryRisk - cz-morava profile', () => {
  const profile = REGION_PROFILES['cz-morava']

  it('reports high risk when mean >=13 °C, min >=8 °C, precip >=10mm/24h and oospores are mature', () => {
    const hourly = seasonHours(() => ({ temperature2m: 18, precipitation: 1 }))
    const results = downyMildewPrimaryRisk(hourly, { budbreak: BUDBREAK }, profile)
    const target = results.find((r) => r.date === TARGET)
    expect(target?.risk).toBe('high')
    expect(target?.reasons[0]).toMatchObject({ key: 'riskReasons.primaryMet', params: { profile: 'cz-morava' } })
    expect(target?.source).toBe(profile.source)
  })

  it('suggests an incubation-based leaf check after a high-risk event', () => {
    const hourly = seasonHours(() => ({ temperature2m: 18, precipitation: 1 }))
    const results = downyMildewPrimaryRisk(hourly, { budbreak: BUDBREAK }, profile)
    const target = results.find((r) => r.date === TARGET)
    expect(target?.reasons.map((r) => r.key)).toContain('riskReasons.leafCheck')
  })

  it('stays low risk when mean temperature is below 13 °C even if everything else matches', () => {
    // one cold day barely moves the whole-season degree-day sum, so oospore
    // maturity still holds; only this day's own mean/min temperature fails.
    const hourly = seasonHours(() => ({ temperature2m: 12, precipitation: 10 }))
    const results = downyMildewPrimaryRisk(hourly, { budbreak: BUDBREAK }, profile)
    const target = results.find((r) => r.date === TARGET)
    expect(target?.risk).toBe('low')
  })

  it('treats a minimum temperature of exactly 8 °C as satisfying the threshold (boundary)', () => {
    const hourly = seasonHours((hour) => ({
      temperature2m: hour === 0 ? 8 : 20, // min exactly 8, mean well above 13
      precipitation: 10,
    }))
    const results = downyMildewPrimaryRisk(hourly, { budbreak: BUDBREAK }, profile)
    const target = results.find((r) => r.date === TARGET)
    expect(target?.risk).toBe('high')
  })

  it('stays low risk without precipitation', () => {
    const hourly = seasonHours(() => ({ temperature2m: 18, precipitation: 0 }))
    const results = downyMildewPrimaryRisk(hourly, { budbreak: BUDBREAK }, profile)
    const target = results.find((r) => r.date === TARGET)
    expect(target?.risk).toBe('low')
  })

  it('stays low risk without a budbreak date (oospore maturity unknown)', () => {
    const hourly = makeDay('2026-05-01', () => ({ temperature2m: 18, precipitation: 10 }))
    const results = downyMildewPrimaryRisk(hourly, {}, profile)
    expect(results[0].risk).toBe('low')
  })

  it('ignores the shoot-length date entirely', () => {
    const hourly = seasonHours(() => ({ temperature2m: 18, precipitation: 10 }))
    // no shoot10cm provided at all, yet the day should still be high risk
    const results = downyMildewPrimaryRisk(hourly, { budbreak: BUDBREAK }, profile)
    const target = results.find((r) => r.date === TARGET)
    expect(target?.risk).toBe('high')
  })
})

describe('downyMildewPrimaryRisk - eu-generic profile', () => {
  const profile = REGION_PROFILES['eu-generic']

  it('requires a recorded shoot10cm date before flagging risk', () => {
    const hourly = makeDay('2026-05-01', () => ({ temperature2m: 15, precipitation: 10 }))
    const withoutDate = downyMildewPrimaryRisk(hourly, {}, profile)
    expect(withoutDate[0].risk).toBe('low')

    const withDate = downyMildewPrimaryRisk(hourly, { shoot10cm: '2026-04-15' }, profile)
    expect(withDate[0].risk).toBe('high')
  })

  it('does not require oospore maturity', () => {
    const hourly = makeDay('2026-05-01', () => ({ temperature2m: 15, precipitation: 10 }))
    const results = downyMildewPrimaryRisk(hourly, { shoot10cm: '2026-04-15' }, profile)
    expect(results[0].risk).toBe('high')
    expect(results[0].reasons[0].conditions?.map((c) => c.key)).not.toContain('riskReasons.oosporesMature')
  })

  it('does not suggest an incubation check (not tracked for eu-generic)', () => {
    const hourly = makeDay('2026-05-01', () => ({ temperature2m: 15, precipitation: 10 }))
    const results = downyMildewPrimaryRisk(hourly, { shoot10cm: '2026-04-15' }, profile)
    expect(results[0].reasons.map((r) => r.key)).not.toContain('riskReasons.leafCheck')
  })

  it('uses the daily maximum temperature against the 10 °C baseline', () => {
    const hourly = makeDay('2026-05-01', (hour) => ({
      temperature2m: hour === 12 ? 10 : 2,
      precipitation: 10,
    }))
    const results = downyMildewPrimaryRisk(hourly, { shoot10cm: '2026-04-15' }, profile)
    expect(results[0].risk).toBe('high')
  })
})

describe('downyMildewPrimaryRisk - priorDegreeSum (persisted accumulation)', () => {
  const profile = REGION_PROFILES['cz-morava']

  it('reaches oospore maturity using a persisted prior sum even when `hourly` only covers a few recent days', () => {
    // Only 3 days of hourly data (nowhere near enough on its own to reach
    // 170 DS), but a prior sum of 165 means one more warm day tips it over —
    // this is exactly the short weather-cache-window scenario in the app.
    const hourly = [
      ...makeDay('2026-05-01', () => ({ temperature2m: 18 })),
      ...makeDay('2026-05-02', () => ({ temperature2m: 18, precipitation: 10 })),
    ]
    // without a prior sum and no hourly history reaching back to budbreak,
    // maturity is unreachable from this short window alone
    const withoutPrior = downyMildewPrimaryRisk(hourly, { budbreak: '2026-04-01' }, profile)
    expect(withoutPrior[1].risk).toBe('low')

    // with the persisted running sum, one more +10 DS day crosses 170
    const withPrior = downyMildewPrimaryRisk(hourly, {}, profile, 165)
    expect(withPrior[1].risk).toBe('high')
  })

  it('treats every day in `hourly` as new when a prior sum is given, regardless of budbreak', () => {
    const hourly = makeDay('2026-05-01', () => ({ temperature2m: 20, precipitation: 10 }))
    // no budbreak at all, but a prior sum means maturity can still be assessed
    const results = downyMildewPrimaryRisk(hourly, {}, profile, 168)
    expect(results[0].risk).toBe('high')
  })
})

describe('countPrimaryInfectionEvents', () => {
  it('counts only high-risk primary days', () => {
    const results: RiskResult[] = [
      { date: '2026-05-01', risk: 'high', reasons: [], rule: 'downy-primary-cz-morava', source: 's' },
      { date: '2026-05-02', risk: 'low', reasons: [], rule: 'downy-primary-cz-morava', source: 's' },
      { date: '2026-05-03', risk: 'high', reasons: [], rule: 'downy-primary-cz-morava', source: 's' },
      { date: '2026-05-04', risk: 'high', reasons: [], rule: 'powdery-mildew', source: 's' },
    ]
    expect(countPrimaryInfectionEvents(results)).toBe(2)
  })
})
