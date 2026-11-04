/**
 * File: dailyAccumulator.test.ts
 * Created: 2026-10-02
 * Description: Tests the persisted day-by-day accumulator, including skipped days and resets.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { DayHours } from '../../rules'
import { deleteSetting } from '../../db/settingsRepo'
import { syncDailyAccumulator } from './dailyAccumulator'

function day(date: string): DayHours {
  return { date, hours: [] }
}

const KEY = 'test:dailyAccumulator:sum'

afterEach(async () => {
  await deleteSetting(KEY)
})

describe('syncDailyAccumulator', () => {
  it('does not double-count a day processed twice (idempotency)', async () => {
    const first = await syncDailyAccumulator<number>({
      settingsKey: KEY,
      resetFromDate: '2026-05-01',
      initialState: 0,
      days: [day('2026-05-01'), day('2026-05-02')],
      step: (sum) => sum + 10,
    })
    expect(first.state).toBe(20)

    // same days passed again (e.g. still present in the rolling weather cache)
    const second = await syncDailyAccumulator<number>({
      settingsKey: KEY,
      resetFromDate: '2026-05-01',
      initialState: 0,
      days: [day('2026-05-01'), day('2026-05-02')],
      step: (sum) => sum + 10,
    })
    expect(second.state).toBe(20) // unchanged, not 40
    expect(second.newlyProcessedDays).toEqual([])
  })

  it('resumes from the persisted state and only processes genuinely new days', async () => {
    await syncDailyAccumulator<number>({
      settingsKey: KEY,
      resetFromDate: '2026-05-01',
      initialState: 0,
      days: [day('2026-05-01'), day('2026-05-02')],
      step: (sum) => sum + 10,
    })

    const second = await syncDailyAccumulator<number>({
      settingsKey: KEY,
      resetFromDate: '2026-05-01',
      initialState: 0,
      days: [day('2026-05-01'), day('2026-05-02'), day('2026-05-03')],
      step: (sum) => sum + 10,
    })
    expect(second.state).toBe(30)
    expect(second.newlyProcessedDays.map((d) => d.date)).toEqual(['2026-05-03'])
  })

  it('restarts from scratch when resetFromDate changes (e.g. a corrected budbreak date)', async () => {
    await syncDailyAccumulator<number>({
      settingsKey: KEY,
      resetFromDate: '2026-05-01',
      initialState: 0,
      days: [day('2026-05-01'), day('2026-05-02'), day('2026-05-03')],
      step: (sum) => sum + 10,
    })

    const corrected = await syncDailyAccumulator<number>({
      settingsKey: KEY,
      resetFromDate: '2026-04-28', // earlier date discovered later
      initialState: 0,
      days: [day('2026-04-28'), day('2026-04-29'), day('2026-04-30'), day('2026-05-01'), day('2026-05-02'), day('2026-05-03')],
      step: (sum) => sum + 10,
    })
    expect(corrected.state).toBe(60) // 6 days, not resuming the old 30
  })
})
