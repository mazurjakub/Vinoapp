/**
 * File: importRepo.ts
 * Created: 2026-10-20
 * Description: Validates an export file and replaces the current data with its contents.
 */

import { db } from '../../db'
import type { Harvest, Work } from '../../db/schema'
import { classifySettingsKey } from '../../db/settingsClassification'
import { dataUrlToBlob } from './blobCodec'
import { EXPORT_FORMAT, type ExportPayload } from './exportRepo'

/** Older exports have `sugarOe` instead of sugar + sugarUnit. */
function normalizeHarvest(raw: Harvest & { sugarOe?: number }): Harvest {
  if (raw.sugarOe === undefined) return raw
  const { sugarOe, ...rest } = raw
  return { ...rest, sugar: rest.sugar ?? sugarOe, sugarUnit: rest.sugarUnit ?? 'Oe' }
}

export function isExportPayload(value: unknown): value is ExportPayload {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.format !== EXPORT_FORMAT) return false
  if (typeof record.schemaVersion !== 'number') return false
  if (typeof record.tables !== 'object' || record.tables === null) return false
  const tables = record.tables as Record<string, unknown>
  const requiredKeys = [
    'vineyards',
    'varieties',
    'growthStages',
    'sprays',
    'works',
    'harvests',
    'infectionEvents',
    'settings',
  ]
  return requiredKeys.every((key) => Array.isArray(tables[key]))
}

/** Replaces all local data with the payload. Ids are kept so references between tables still work. */
export async function importData(payload: ExportPayload): Promise<void> {
  const works: Work[] = await Promise.all(
    payload.tables.works.map(async ({ photoBlob, ...rest }) => ({
      ...rest,
      photoBlob: photoBlob ? await dataUrlToBlob(photoBlob) : undefined,
    })),
  )

  await db.transaction(
    'rw',
    [
      db.vineyards,
      db.varieties,
      db.growthStages,
      db.sprays,
      db.works,
      db.harvests,
      db.infectionEvents,
      db.settings,
      db.dailyRisk,
    ],
    async () => {
      await Promise.all([
        db.vineyards.clear(),
        db.varieties.clear(),
        db.growthStages.clear(),
        db.sprays.clear(),
        db.works.clear(),
        db.harvests.clear(),
        db.infectionEvents.clear(),
        db.settings.clear(),
      ])
      await db.vineyards.bulkAdd(payload.tables.vineyards)
      await db.varieties.bulkAdd(payload.tables.varieties)
      await db.growthStages.bulkAdd(payload.tables.growthStages)
      await db.sprays.bulkAdd(payload.tables.sprays)
      await db.works.bulkAdd(works)
      await db.harvests.bulkAdd(payload.tables.harvests.map(normalizeHarvest))
      // Exports from before event statuses have no `status`.
      await db.infectionEvents.bulkAdd(payload.tables.infectionEvents.map((e) => ({ ...e, status: e.status ?? 'active' })))

      // Only user settings, derived state is rebuilt by the next sync.
      const importableSettings = payload.tables.settings.filter((s) => classifySettingsKey(s.key) === 'user')
      await db.settings.bulkAdd(importableSettings)
      await db.dailyRisk.clear()
    },
  )
}
