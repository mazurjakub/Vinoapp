/**
 * File: index.ts
 * Created: 2026-10-03
 * Description: Dexie database definition with all tables and versioned schema migrations.
 */

import Dexie, { type EntityTable } from 'dexie'
import type {
  DailyRisk,
  GrowthStage,
  Harvest,
  InfectionEvent,
  Setting,
  Spray,
  Variety,
  Vineyard,
  WeatherCache,
  Work,
} from './schema'
import { defaultRegionProfileFor } from './regionProfile'

export class VinarDB extends Dexie {
  vineyards!: EntityTable<Vineyard, 'id'>
  varieties!: EntityTable<Variety, 'id'>
  growthStages!: EntityTable<GrowthStage, 'id'>
  sprays!: EntityTable<Spray, 'id'>
  works!: EntityTable<Work, 'id'>
  harvests!: EntityTable<Harvest, 'id'>
  infectionEvents!: EntityTable<InfectionEvent, 'id'>
  weatherCache!: EntityTable<WeatherCache, 'id'>
  dailyRisk!: EntityTable<DailyRisk, 'id'>
  settings!: EntityTable<Setting, 'id'>

  constructor(name = 'vinar') {
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

    // v2: renamed `phenology` table to `growthStages` and `vineyards.vineCount`
    // to `vineyards.vineHeadCount` to match the UI terminology ("růstová fáze").
    this.version(2)
      .stores({
        phenology: null,
        growthStages: '++id, vineyardId, year, stage',
      })
      .upgrade(async (tx) => {
        const oldStages = await tx.table('phenology').toArray()
        if (oldStages.length > 0) {
          await tx.table('growthStages').bulkAdd(oldStages)
        }

        await tx
          .table('vineyards')
          .toCollection()
          .modify((vineyard: Vineyard & { vineCount?: number }) => {
            if (vineyard.vineCount !== undefined) {
              vineyard.vineHeadCount = vineyard.vineCount
              delete vineyard.vineCount
            }
          })
      })

    // v3: adds `varieties` and `infectionEvents`, and replaces the
    // free-text `vineyards.variety` with `vineyards.varietyId` (FK into
    // `varieties`, deduped by name) plus a `vineyards.regionProfile` guess
    // based on coordinates. `vineHeadCount` is untouched (still used).
    this.version(3)
      .stores({
        varieties: '++id, &name',
        infectionEvents: '++id, vineyardId, date, disease, type',
        vineyards: '++id, name, varietyId',
      })
      .upgrade(async (tx) => {
        const vineyardsTable = tx.table('vineyards')
        const varietiesTable = tx.table('varieties')

        const allVineyards = await vineyardsTable.toArray()
        const nameToId = new Map<string, number>()

        for (const vineyard of allVineyards as Array<Vineyard & { variety?: string }>) {
          const varietyName = vineyard.variety?.trim()
          if (!varietyName || nameToId.has(varietyName)) continue

          const now = new Date().toISOString()
          const id = await varietiesTable.add({
            name: varietyName,
            isPiwi: false,
            susceptibility: { downy: 'medium', powdery: 'medium', botrytis: 'medium' },
            stageOffsetDays: 0,
            createdAt: now,
            updatedAt: now,
          })
          nameToId.set(varietyName, id as number)
        }

        await vineyardsTable
          .toCollection()
          .modify((vineyard: Record<string, unknown> & { lat: number; lon: number; variety?: string }) => {
            const varietyName = vineyard.variety?.trim()
            if (varietyName) {
              vineyard.varietyId = nameToId.get(varietyName)
            }
            vineyard.regionProfile = defaultRegionProfileFor(vineyard.lat, vineyard.lon)
            delete vineyard.variety
          })
      })

    // v4: renames `harvests.sugarOe` to
    // `harvests.sugar` + `harvests.sugarUnit`, so the unit travels with each
    // record instead of being implied by the (changeable) app-wide setting.
    this.version(4).stores({}).upgrade(async (tx) => {
      await tx
        .table('harvests')
        .toCollection()
        .modify((harvest: Record<string, unknown> & { sugarOe?: number }) => {
          if (harvest.sugarOe !== undefined) {
            harvest.sugar = harvest.sugarOe
            harvest.sugarUnit = 'Oe'
            delete harvest.sugarOe
          }
        })
    })

    // v5: per-day risk snapshots for the weather chart (see DailyRisk in schema.ts).
    // Nothing to migrate: the table starts empty and the next sync fills it.
    this.version(5).stores({
      dailyRisk: '++id, &[vineyardId+date]',
    })

    // v6: no data change. An older Goidanich state is replaced by the next
    // successful sync (see GOIDANICH_ENGINE_VERSION), so it survives being offline.
    this.version(6).stores({})

    // v7: infection events get a status, so one the data no longer supports is
    // revoked instead of deleted. Every existing event stays active.
    this.version(7).stores({}).upgrade(async (tx) => {
      await tx
        .table('infectionEvents')
        .toCollection()
        .modify((event: Record<string, unknown>) => {
          event.status = 'active'
        })
    })
  }
}

export const db = new VinarDB()

export * from './schema'
