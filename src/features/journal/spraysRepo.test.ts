/**
 * File: spraysRepo.test.ts
 * Created: 2026-10-03
 * Description: Tests the spray database functions.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { addSpray, getLastSprayDatetime, listSpraysForVineyard } from './spraysRepo'

const VINEYARD_ID = 444000222

afterEach(async () => {
  await db.sprays.where('vineyardId').equals(VINEYARD_ID).delete()
})

describe('spraysRepo', () => {
  it('lists sprays newest first', async () => {
    await addSpray({
      vineyardId: VINEYARD_ID,
      datetime: '2026-05-01T08:00',
      product: 'A',
      activeSubstance: 'a',
      dose: '1 l/ha',
      target: 'downy',
    })
    await addSpray({
      vineyardId: VINEYARD_ID,
      datetime: '2026-05-10T08:00',
      product: 'B',
      activeSubstance: 'b',
      dose: '2 l/ha',
      target: 'powdery',
    })
    const list = await listSpraysForVineyard(VINEYARD_ID)
    expect(list.map((s) => s.product)).toEqual(['B', 'A'])
  })

  it('finds the most recent spray for a given target only', async () => {
    await addSpray({
      vineyardId: VINEYARD_ID,
      datetime: '2026-05-01T08:00',
      product: 'A',
      activeSubstance: 'a',
      dose: '1 l/ha',
      target: 'downy',
    })
    await addSpray({
      vineyardId: VINEYARD_ID,
      datetime: '2026-05-15T08:00',
      product: 'B',
      activeSubstance: 'b',
      dose: '2 l/ha',
      target: 'powdery',
    })
    await addSpray({
      vineyardId: VINEYARD_ID,
      datetime: '2026-05-20T08:00',
      product: 'C',
      activeSubstance: 'c',
      dose: '1 l/ha',
      target: 'downy',
    })

    expect(await getLastSprayDatetime(VINEYARD_ID, 'downy')).toBe('2026-05-20T08:00')
    expect(await getLastSprayDatetime(VINEYARD_ID, 'powdery')).toBe('2026-05-15T08:00')
    expect(await getLastSprayDatetime(VINEYARD_ID, 'botrytis')).toBeNull()
  })
})
