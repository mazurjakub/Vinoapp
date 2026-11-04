/**
 * File: exportRepo.ts
 * Created: 2026-10-20
 * Description: Builds the JSON export of user data and downloads it as a file.
 */

import { db } from '../../db'
import type {
  GrowthStage,
  Harvest,
  InfectionEvent,
  Setting,
  Spray,
  Variety,
  Vineyard,
  Work,
} from '../../db/schema'
import { classifySettingsKey } from '../../db/settingsClassification'
import { blobToDataUrl } from './blobCodec'

export const EXPORT_FORMAT = 'vinar-export-v1'

/** Bump when the shape of `tables` changes, so a future import can migrate older files. */
export const EXPORT_SCHEMA_VERSION = 1

/** `Work` with `photoBlob` serialized to a data: URL string instead of a Blob. */
export type SerializedWork = Omit<Work, 'photoBlob'> & { photoBlob?: string }

export interface ExportPayload {
  format: typeof EXPORT_FORMAT
  schemaVersion: number
  exportedAt: string
  tables: {
    vineyards: Vineyard[]
    varieties: Variety[]
    growthStages: GrowthStage[]
    sprays: Spray[]
    works: SerializedWork[]
    harvests: Harvest[]
    infectionEvents: InfectionEvent[]
    settings: Setting[]
  }
}

/** Everything the user entered. Weather cache, snapshots and derived settings are left out, the next sync rebuilds them. */
export async function buildExportPayload(): Promise<ExportPayload> {
  const [vineyards, varieties, growthStages, sprays, rawWorks, harvests, infectionEvents, settings] =
    await Promise.all([
      db.vineyards.toArray(),
      db.varieties.toArray(),
      db.growthStages.toArray(),
      db.sprays.toArray(),
      db.works.toArray(),
      db.harvests.toArray(),
      db.infectionEvents.toArray(),
      db.settings.toArray(),
    ])

  const works: SerializedWork[] = await Promise.all(
    rawWorks.map(async ({ photoBlob, ...rest }) => ({
      ...rest,
      photoBlob: photoBlob ? await blobToDataUrl(photoBlob) : undefined,
    })),
  )

  const exportableSettings = settings.filter((s) => classifySettingsKey(s.key) === 'user')

  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tables: { vineyards, varieties, growthStages, sprays, works, harvests, infectionEvents, settings: exportableSettings },
  }
}

export function downloadExport(payload: ExportPayload): void {
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `vinar-export-${payload.exportedAt.slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
