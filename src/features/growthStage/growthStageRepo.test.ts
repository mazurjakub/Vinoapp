/**
 * File: growthStageRepo.test.ts
 * Created: 2026-10-31
 * Description: Tests which date counts as the harvest for a season.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { addGrowthStage, getPhenologyDatesForYear } from './growthStageRepo'

const VINEYARD_ID = 777000333
const now = new Date().toISOString()

const addHarvest = (date: string) =>
  db.harvests.add({
    vineyardId: VINEYARD_ID,
    year: Number(date.slice(0, 4)),
    date,
    weightKg: 10,
    createdAt: now,
    updatedAt: now,
  })

afterEach(async () => {
  await db.harvests.where('vineyardId').equals(VINEYARD_ID).delete()
  await db.growthStages.where('vineyardId').equals(VINEYARD_ID).delete()
})

describe('getPhenologyDatesForYear - harvest', () => {
  it('falls back to the last harvest record of that year, for a harvest done in parts', async () => {
    await addHarvest('2026-09-10')
    await addHarvest('2026-09-28')
    await addHarvest('2025-10-20')
    expect((await getPhenologyDatesForYear(VINEYARD_ID, 2026)).harvest).toBe('2026-09-28')
  })

  it('prefers the recorded harvest stage', async () => {
    await addHarvest('2026-09-28')
    await addGrowthStage({ vineyardId: VINEYARD_ID, stage: 'harvest', date: '2026-09-15' })
    expect((await getPhenologyDatesForYear(VINEYARD_ID, 2026)).harvest).toBe('2026-09-15')
  })

  it('stays empty without a stage or a record', async () => {
    expect((await getPhenologyDatesForYear(VINEYARD_ID, 2026)).harvest).toBeUndefined()
  })
})
