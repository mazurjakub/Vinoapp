/**
 * File: infectionEventsRepo.test.ts
 * Created: 2026-10-02
 * Description: Tests recording and counting primary infection events.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import type { RiskResult } from '../../rules'
import {
  countSeasonInfectionEvents,
  listRevokedInfectionEvents,
  recordPrimaryInfectionEvents,
  revokeUnconfirmedPrimaryEvents,
} from './infectionEventsRepo'

const VINEYARD_ID = 987654321

afterEach(async () => {
  await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).delete()
})

function result(date: string, risk: RiskResult['risk'], rule = 'downy-primary-cz-morava'): RiskResult {
  return { date, risk, reasons: [], rule, source: 'test' }
}

describe('recordPrimaryInfectionEvents', () => {
  it('stores one event per newly-detected high-risk primary day', async () => {
    await recordPrimaryInfectionEvents(VINEYARD_ID, [
      result('2026-05-01', 'high'),
      result('2026-05-02', 'low'),
      result('2026-05-03', 'high'),
    ])

    const count = await countSeasonInfectionEvents(VINEYARD_ID, 2026, 'downy', 'primary')
    expect(count).toBe(2)
  })

  it('does not duplicate events already recorded for the same date', async () => {
    await recordPrimaryInfectionEvents(VINEYARD_ID, [result('2026-05-01', 'high')])
    await recordPrimaryInfectionEvents(VINEYARD_ID, [result('2026-05-01', 'high'), result('2026-05-02', 'high')])

    const count = await countSeasonInfectionEvents(VINEYARD_ID, 2026, 'downy', 'primary')
    expect(count).toBe(2)
  })
})

describe('revoking an infection event', () => {
  const RULE = 'downy-primary-cz-morava'

  it('keeps the event with its reason, and leaves it out of the season count', async () => {
    await recordPrimaryInfectionEvents(VINEYARD_ID, [result('2026-05-01', 'high', RULE)])
    await revokeUnconfirmedPrimaryEvents(VINEYARD_ID, [result('2026-05-01', 'low', RULE)])

    expect(await countSeasonInfectionEvents(VINEYARD_ID, 2026, 'downy', 'primary')).toBe(0)
    const [revoked] = await listRevokedInfectionEvents(VINEYARD_ID)
    expect(revoked).toMatchObject({ date: '2026-05-01', status: 'revoked', revokedReason: 'refinedDataNotMet' })
    expect(revoked.revokedAt).toBeTruthy()
  })

  it('makes it active again if the day qualifies later, without a duplicate', async () => {
    await recordPrimaryInfectionEvents(VINEYARD_ID, [result('2026-05-01', 'high', RULE)])
    await revokeUnconfirmedPrimaryEvents(VINEYARD_ID, [result('2026-05-01', 'low', RULE)])
    await recordPrimaryInfectionEvents(VINEYARD_ID, [result('2026-05-01', 'high', RULE)])

    expect(await countSeasonInfectionEvents(VINEYARD_ID, 2026, 'downy', 'primary')).toBe(1)
    expect(await listRevokedInfectionEvents(VINEYARD_ID)).toEqual([])
    const [event] = await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).toArray()
    expect(event.revokedAt).toBeUndefined()
  })
})
