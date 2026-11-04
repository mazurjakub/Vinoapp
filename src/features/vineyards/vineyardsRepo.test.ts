/**
 * File: vineyardsRepo.test.ts
 * Created: 2026-10-20
 * Description: Tests plot deletion, including its related records and the selected plot.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { SETTINGS_KEYS } from '../../db/settingsKeys'
import { setSetting } from '../../db/settingsRepo'
import { deleteVineyard } from './vineyardsRepo'

const VINEYARD_A = 900000001
const VINEYARD_B = 900000002

async function cleanup(id: number) {
  await db.vineyards.delete(id)
  await db.growthStages.where('vineyardId').equals(id).delete()
  await db.sprays.where('vineyardId').equals(id).delete()
  await db.works.where('vineyardId').equals(id).delete()
  await db.harvests.where('vineyardId').equals(id).delete()
  await db.weatherCache.where('vineyardId').equals(id).delete()
  await db.dailyRisk.where('vineyardId').equals(id).delete()
  await db.infectionEvents.where('vineyardId').equals(id).delete()
  await db.settings.filter((row) => row.key.includes(`:${id}:`) || row.key.endsWith(`:${id}`)).delete()
}

afterEach(async () => {
  await cleanup(VINEYARD_A)
  await cleanup(VINEYARD_B)
  await db.settings.where('key').equals(SETTINGS_KEYS.selectedVineyardId).delete()
})

/** One row in every table and every derived settings key for the vineyard. */
async function fillVineyard(id: number): Promise<void> {
  const now = new Date().toISOString()
  await db.vineyards.put({
    id,
    name: `Fill test ${id}`,
    lat: 49,
    lon: 17,
    regionProfile: 'cz-morava',
    varietyId: 1,
    plantedYear: 2020,
    createdAt: now,
    updatedAt: now,
  })
  await db.growthStages.add({ vineyardId: id, year: 2026, stage: 'budbreak', date: '2026-04-01', createdAt: now, updatedAt: now })
  await db.sprays.add({
    vineyardId: id,
    datetime: '2026-05-01T08:00',
    product: 'Test',
    activeSubstance: 'test',
    dose: '1 l/ha',
    target: 'downy',
    createdAt: now,
    updatedAt: now,
  })
  await db.works.add({ vineyardId: id, datetime: '2026-03-01T08:00', type: 'pruning', createdAt: now, updatedAt: now })
  await db.harvests.add({ vineyardId: id, year: 2026, date: '2026-09-15', weightKg: 100, createdAt: now, updatedAt: now })
  await db.weatherCache.add({ vineyardId: id, fetchedAt: now, hourly: [] })
  await db.dailyRisk.add({ vineyardId: id, date: '2026-05-01', source: 'archive', meanTempC: 15 })
  await db.infectionEvents.add({ vineyardId: id, date: '2026-05-01', disease: 'downy', type: 'primary', rule: 'test', status: 'active', createdAt: now, updatedAt: now })
  await setSetting(`degreeSum:${id}:2026:cz-morava`, { state: 180, lastProcessedDate: '2026-05-01', resetFromDate: '2026-04-01' })
  await setSetting(`goidanichState:${id}:2026`, { state: {}, lastProcessedDate: '2026-05-01', resetFromDate: '2026-05-01' })
  await setSetting(`gublerThomasState:${id}:2026`, { state: {}, lastProcessedDate: '2026-05-01', resetFromDate: '2026-01-01' })
  await setSetting(`daySource:${id}:2026`, { '2026-05-01': 'archive' })
  await setSetting(`lastSeasonSync:${id}`, { ok: true, failedSections: [], syncedAt: now })
}

async function countsForVineyard(id: number) {
  const settings = await db.settings.toArray()
  return {
    vineyard: await db.vineyards.get(id),
    growthStages: await db.growthStages.where('vineyardId').equals(id).count(),
    sprays: await db.sprays.where('vineyardId').equals(id).count(),
    works: await db.works.where('vineyardId').equals(id).count(),
    harvests: await db.harvests.where('vineyardId').equals(id).count(),
    weatherCache: await db.weatherCache.where('vineyardId').equals(id).count(),
    dailyRisk: await db.dailyRisk.where('vineyardId').equals(id).count(),
    infectionEvents: await db.infectionEvents.where('vineyardId').equals(id).count(),
    settingsKeysWithId: settings.filter((s) => s.key.includes(String(id))).map((s) => s.key),
  }
}

describe('deleteVineyard', () => {
  it('removes every row and every derived settings key for the deleted vineyard, across all tables', async () => {
    await fillVineyard(VINEYARD_A)
    await setSetting(SETTINGS_KEYS.selectedVineyardId, VINEYARD_A)

    await deleteVineyard(VINEYARD_A)

    const after = await countsForVineyard(VINEYARD_A)
    expect(after).toEqual({
      vineyard: undefined,
      growthStages: 0,
      sprays: 0,
      works: 0,
      harvests: 0,
      weatherCache: 0,
      dailyRisk: 0,
      infectionEvents: 0,
      settingsKeysWithId: [],
    })

    const selected = await db.settings.where('key').equals(SETTINGS_KEYS.selectedVineyardId).first()
    expect(selected).toBeUndefined()
  })

  it("doesn't let one vineyard's id be a substring match for another's (e.g. 1 vs 14)", async () => {
    const SHORT_ID = 91
    const LONG_ID = 914 // "91" is a substring of "914"
    await fillVineyard(SHORT_ID)
    await fillVineyard(LONG_ID)

    await deleteVineyard(SHORT_ID)

    const long = await countsForVineyard(LONG_ID)
    expect(long.vineyard).toBeDefined()
    expect(long.settingsKeysWithId).toHaveLength(5)

    await cleanup(LONG_ID)
  })
})
