/**
 * File: migration.test.ts
 * Created: 2026-10-03
 * Description: Tests that existing data survives the Dexie schema migrations.
 */

import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { VinarDB } from './index'

/** Mirrors the v1→v2 schema only, to seed a database as if it had never seen v3. */
class LegacyDB extends Dexie {
  constructor(name: string) {
    super(name)
    this.version(1).stores({
      vineyards: '++id, name',
      phenology: '++id, vineyardId, year, stage',
      sprays: '++id, vineyardId, datetime, target',
      works: '++id, vineyardId, datetime, type',
      harvests: '++id, vineyardId, year',
      weatherCache: '++id, vineyardId, fetchedAt',
      settings: '++id, &key',
    })
    this.version(2)
      .stores({
        phenology: null,
        growthStages: '++id, vineyardId, year, stage',
      })
      .upgrade(async () => {
        // no existing rows in these tests, nothing to carry over
      })
  }
}

function uniqueDbName(): string {
  return `vinar-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

describe('v3 migration: variety -> varietyId, regionProfile', () => {
  it('dedupes variety names into the varieties table and links vineyards by id', async () => {
    const dbName = uniqueDbName()
    const legacy = new LegacyDB(dbName)
    await legacy.open()

    const now = new Date().toISOString()
    await legacy.table('vineyards').bulkAdd([
      {
        name: 'A',
        lat: 49.0,
        lon: 17.0,
        variety: 'Ryzlink rýnský',
        plantedYear: 2018,
        vineHeadCount: 500,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: 'B',
        lat: 49.1,
        lon: 17.1,
        variety: 'Ryzlink rýnský',
        plantedYear: 2019,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: 'C',
        lat: 45.0,
        lon: 2.0,
        variety: 'Chardonnay',
        plantedYear: 2020,
        createdAt: now,
        updatedAt: now,
      },
    ])
    legacy.close()

    const upgraded = new VinarDB(dbName)
    await upgraded.open()

    try {
      const varieties = await upgraded.varieties.toArray()
      expect(varieties).toHaveLength(2)

      const ryzlink = varieties.find((v) => v.name === 'Ryzlink rýnský')
      const chardonnay = varieties.find((v) => v.name === 'Chardonnay')
      expect(ryzlink).toBeDefined()
      expect(chardonnay).toBeDefined()

      const vineyards = await upgraded.vineyards.toArray()
      const a = vineyards.find((v) => v.name === 'A')!
      const b = vineyards.find((v) => v.name === 'B')!
      const c = vineyards.find((v) => v.name === 'C')!

      // deduped: both A and B point at the same variety row
      expect(a.varietyId).toBe(ryzlink!.id)
      expect(b.varietyId).toBe(ryzlink!.id)
      expect(c.varietyId).toBe(chardonnay!.id)

      expect((a as unknown as Record<string, unknown>).variety).toBeUndefined()

      expect(a.vineHeadCount).toBe(500)
      expect(a.plantedYear).toBe(2018)

      expect(a.regionProfile).toBe('cz-morava')
      expect(c.regionProfile).toBe('eu-generic')
    } finally {
      await upgraded.delete()
    }
  })
})

/** Mirrors v1-v3 only, to seed a database as if it had never seen v4. */
class PreV4DB extends Dexie {
  constructor(name: string) {
    super(name)
    this.version(1).stores({
      vineyards: '++id, name',
      phenology: '++id, vineyardId, year, stage',
      sprays: '++id, vineyardId, datetime, target',
      works: '++id, vineyardId, datetime, type',
      harvests: '++id, vineyardId, year',
      weatherCache: '++id, vineyardId, fetchedAt',
      settings: '++id, &key',
    })
    this.version(2)
      .stores({ phenology: null, growthStages: '++id, vineyardId, year, stage' })
      .upgrade(async () => {})
    this.version(3)
      .stores({
        varieties: '++id, &name',
        infectionEvents: '++id, vineyardId, date, disease, type',
        vineyards: '++id, name, varietyId',
      })
      .upgrade(async () => {})
  }
}

/** Mirrors v1-v5 only, to seed a database as if it had never seen v6. */
class PreV6DB extends PreV4DB {
  constructor(name: string) {
    super(name)
    this.version(4).stores({})
    this.version(5).stores({ dailyRisk: '++id, &[vineyardId+date]' })
  }
}

describe('v6 migration: Goidanich cycle state', () => {
  it('keeps the old Goidanich state until a sync replaces it', async () => {
    const dbName = uniqueDbName()
    const legacy = new PreV6DB(dbName)
    await legacy.open()
    await legacy.table('settings').bulkAdd([
      { key: 'goidanichState:1:2026', value: { state: { accumulatedPct: 95 } } },
      { key: 'gublerThomasState:1:2026', value: { state: { score: 0 } } },
      { key: 'sugarUnit', value: 'Oe' },
    ])
    legacy.close()

    const upgraded = new VinarDB(dbName)
    await upgraded.open()

    try {
      const keys = (await upgraded.settings.toArray()).map((s) => s.key).sort()
      expect(keys).toEqual(['goidanichState:1:2026', 'gublerThomasState:1:2026', 'sugarUnit'])
    } finally {
      await upgraded.delete()
    }
  })
})

describe('v7 migration: infection event status', () => {
  it('marks every existing event as active and keeps its data', async () => {
    const dbName = uniqueDbName()
    const legacy = new PreV6DB(dbName)
    legacy.version(6).stores({})
    await legacy.open()
    await legacy.table('infectionEvents').add({ vineyardId: 1, date: '2026-05-01', disease: 'downy', type: 'primary', rule: 'downy-primary-cz-morava' })
    legacy.close()

    const upgraded = new VinarDB(dbName)
    await upgraded.open()

    try {
      expect(await upgraded.infectionEvents.toArray()).toMatchObject([{ date: '2026-05-01', rule: 'downy-primary-cz-morava', status: 'active' }])
    } finally {
      await upgraded.delete()
    }
  })
})

describe('v4 migration: harvests.sugarOe -> sugar + sugarUnit', () => {
  it('renames sugarOe to sugar and tags it as Oe', async () => {
    const dbName = uniqueDbName()
    const legacy = new PreV4DB(dbName)
    await legacy.open()

    const now = new Date().toISOString()
    await legacy.table('harvests').bulkAdd([
      { vineyardId: 1, year: 2024, date: '2024-09-20', weightKg: 120, sugarOe: 85, createdAt: now, updatedAt: now },
      { vineyardId: 1, year: 2023, date: '2023-09-18', weightKg: 100, createdAt: now, updatedAt: now },
    ])
    legacy.close()

    const upgraded = new VinarDB(dbName)
    await upgraded.open()

    try {
      const harvests = await upgraded.harvests.orderBy('year').toArray()
      const h2024 = harvests.find((h) => h.year === 2024)!
      const h2023 = harvests.find((h) => h.year === 2023)!

      expect(h2024.sugar).toBe(85)
      expect(h2024.sugarUnit).toBe('Oe')
      expect((h2024 as unknown as Record<string, unknown>).sugarOe).toBeUndefined()

      expect(h2023.sugar).toBeUndefined()
      expect(h2023.sugarUnit).toBeUndefined()
    } finally {
      await upgraded.delete()
    }
  })
})
