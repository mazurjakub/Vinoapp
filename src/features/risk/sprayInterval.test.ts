/**
 * File: sprayInterval.test.ts
 * Created: 2026-11-04
 * Description: Tests the warning about the interval since the last spray.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import type { SprayTarget } from '../../db/schema'
import { daysBetween } from '../../rules'
import { addSpray } from '../journal/spraysRepo'
import { localDateKey } from '../weather/format'
import { getSprayIntervalAnchors, hasHighRiskAhead, sprayIntervalWarning, type SprayIntervalInput } from './sprayInterval'

const VINEYARD_ID = 555000333
const now = '2026-01-01T00:00:00.000Z'
const BUDBREAK = '2026-04-20'

const base: SprayIntervalInput = {
  today: '2026-06-20',
  warningDays: 10,
  firstInfectionDate: '2026-05-20',
  lastSprayDate: '2026-06-10',
  seasonEndMonthDay: '10-31',
  highRiskAhead: false,
}

function favorableDays(days: Record<string, boolean | null>) {
  return db.dailyRisk.bulkAdd(
    Object.entries(days).map(([date, favorable]) => ({
      vineyardId: VINEYARD_ID,
      date,
      source: 'historical-forecast' as const,
      powderyFavorableDay: favorable,
    })),
  )
}

function spray(date: string, target: SprayTarget) {
  return addSpray({ vineyardId: VINEYARD_ID, datetime: `${date}T08:00`, product: 'P', activeSubstance: 'a', dose: '1', target })
}

afterEach(async () => {
  await db.sprays.where('vineyardId').equals(VINEYARD_ID).delete()
  await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).delete()
  await db.dailyRisk.where('[vineyardId+date]').between([VINEYARD_ID, ''], [VINEYARD_ID, '￿']).delete()
})

describe('sprayIntervalWarning', () => {
  it('warns exactly on the limit, not a day earlier', () => {
    expect(sprayIntervalWarning(base)?.reasons[0]).toEqual({
      key: 'risk.sprayInterval.sinceSpray',
      params: { days: 10, limit: 10 },
      dates: { date: '2026-06-10' },
    })
    expect(sprayIntervalWarning({ ...base, today: '2026-06-19' })).toBeNull()
  })

  it('says nothing without an infection in the season', () => {
    expect(sprayIntervalWarning({ ...base, firstInfectionDate: undefined })).toBeNull()
  })

  it('says nothing after the end of the season, by harvest or by the profile date', () => {
    expect(sprayIntervalWarning({ ...base, harvestDate: '2026-06-15' })).toBeNull()
    expect(sprayIntervalWarning({ ...base, today: '2026-11-01', lastSprayDate: '2026-10-01' })).toBeNull()
  })

  it('counts from the first infection when the season has no spray yet', () => {
    const warning = sprayIntervalWarning({ ...base, lastSprayDate: undefined, today: '2026-05-30' })
    expect(warning?.reasons[0].key).toBe('risk.sprayInterval.sinceInfection')
    expect(warning?.reasons[0].params?.days).toBe(10)
  })

  it('is urgent when the outlook has a high-risk day', () => {
    const warning = sprayIntervalWarning({ ...base, highRiskAhead: true })
    expect(warning?.urgent).toBe(true)
    expect(warning?.reasons.map((r) => r.key)).toContain('risk.sprayInterval.highRiskAhead')
  })
})

describe('hasHighRiskAhead', () => {
  const result = (date: string, risk: 'low' | 'high') => ({ date, risk, reasons: [], rule: 'r', source: 's' })

  it('looks at today and the next 6 days only', () => {
    expect(hasHighRiskAhead([result('2026-06-26', 'high')], '2026-06-20')).toBe(true)
    expect(hasHighRiskAhead([result('2026-06-27', 'high'), result('2026-06-19', 'high')], '2026-06-20')).toBe(false)
  })
})

describe('getSprayIntervalAnchors', () => {
  it('keeps downy and powdery sprays apart', async () => {
    await spray('2026-06-01', 'downy')
    await spray('2026-06-15', 'powdery')

    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'downy')).lastSprayDate).toBe('2026-06-01')
    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'powdery', BUDBREAK)).lastSprayDate).toBe('2026-06-15')
  })

  it('ignores sprays from an earlier season', async () => {
    await spray('2025-08-01', 'downy')
    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'downy')).lastSprayDate).toBeUndefined()
  })

  it('takes the first active downy event, a revoked one does not count', async () => {
    const event = { vineyardId: VINEYARD_ID, disease: 'downy' as const, type: 'primary' as const, rule: 'test', createdAt: now, updatedAt: now }
    await db.infectionEvents.add({ ...event, date: '2026-05-10', status: 'revoked' })
    await db.infectionEvents.add({ ...event, date: '2026-05-20', status: 'active' })

    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'downy')).firstInfectionDate).toBe('2026-05-20')
  })

  it('takes the third of the first three favourable days in a row as the powdery start', async () => {
    await favorableDays({ '2026-05-01': true, '2026-05-02': false, '2026-05-03': true, '2026-05-04': true, '2026-05-05': true })

    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'powdery', BUDBREAK)).firstInfectionDate).toBe('2026-05-05')
    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'downy')).firstInfectionDate).toBeUndefined()
  })

  it('has no powdery start without a budbreak date, or from days before budbreak', async () => {
    await favorableDays({ '2026-04-10': true, '2026-04-11': true, '2026-04-12': true })

    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'powdery')).firstInfectionDate).toBeUndefined()
    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'powdery', BUDBREAK)).firstInfectionDate).toBeUndefined()
  })

  it('lets a day without data break the run', async () => {
    await favorableDays({ '2026-05-01': true, '2026-05-02': null, '2026-05-03': true, '2026-05-04': true })
    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'powdery', BUDBREAK)).firstInfectionDate).toBeUndefined()
  })

  it('lets a missing day break the run', async () => {
    await favorableDays({ '2026-05-01': true, '2026-05-02': true, '2026-05-04': true })
    expect((await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'powdery', BUDBREAK)).firstInfectionDate).toBeUndefined()
  })

  it('says nothing after a preventive spray without favourable days', async () => {
    await spray('2026-05-01', 'powdery')
    await favorableDays({ '2026-05-02': false, '2026-05-03': true, '2026-05-04': false })

    const anchors = await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'powdery', BUDBREAK)
    expect(sprayIntervalWarning({ ...base, ...anchors, today: '2026-05-20' })).toBeNull()
  })

  it('counts from a preventive spray once three favourable days follow it', async () => {
    await spray('2026-05-01', 'powdery')
    await favorableDays({ '2026-05-06': true, '2026-05-07': true, '2026-05-08': true })

    const anchors = await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'powdery', BUDBREAK)
    expect(anchors.firstInfectionDate).toBe('2026-05-08')
    expect(sprayIntervalWarning({ ...base, ...anchors, today: '2026-05-11' })?.reasons[0]).toEqual({
      key: 'risk.sprayInterval.sinceSpray',
      params: { days: 10, limit: 10 },
      dates: { date: '2026-05-01' },
    })
  })
})

describe('calendar days', () => {
  it('puts a spray at 0:30 local time on that day', async () => {
    await addSpray({ vineyardId: VINEYARD_ID, datetime: '2026-06-10T00:30', product: 'P', activeSubstance: 'a', dose: '1', target: 'downy' })
    const { lastSprayDate } = await getSprayIntervalAnchors(VINEYARD_ID, 2026, 'downy')

    expect(lastSprayDate).toBe('2026-06-10')
    expect(localDateKey(new Date(2026, 5, 10, 0, 30))).toBe('2026-06-10')
    expect(sprayIntervalWarning({ ...base, lastSprayDate, today: '2026-06-20' })?.reasons[0].params?.days).toBe(10)
  })

  it('counts whole days across the daylight saving changes', () => {
    expect(daysBetween('2026-03-28', '2026-04-07')).toBe(10)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
})
