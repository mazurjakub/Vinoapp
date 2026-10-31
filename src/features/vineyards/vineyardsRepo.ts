/**
 * File: vineyardsRepo.ts
 * Created: 2026-10-20
 * Description: Database access for plots, including deleting all their related records.
 */

import { db } from '../../db'
import type { Vineyard } from '../../db/schema'
import { SETTINGS_KEYS } from '../../db/settingsKeys'

export type VineyardInput = Omit<Vineyard, 'id' | 'createdAt' | 'updatedAt'>

export function listVineyards() {
  return db.vineyards.orderBy('name').toArray()
}

export async function createVineyard(input: VineyardInput): Promise<number> {
  const now = new Date().toISOString()
  const id = await db.vineyards.add({ ...input, createdAt: now, updatedAt: now })
  return id as number
}

export async function updateVineyard(id: number, input: VineyardInput): Promise<void> {
  await db.vineyards.update(id, { ...input, updatedAt: new Date().toISOString() })
}

/** Matches a derived settings key's vineyard-id segment exactly (e.g. `goidanichState:4:2026`
 * or `lastSeasonSync:4`) — never a substring of a different id, like `14`. */
function belongsToVineyard(key: string, id: number): boolean {
  return new RegExp(`(^|:)${id}(:|$)`).test(key)
}

/**
 * Deletes a vineyard and everything keyed to it: every other table that has
 * a `vineyardId` column, plus any derived `settings` row for it (the index
 * accumulators, source log, last-sync result — see
 * `features/risk/syncSeasonState.ts`). If `selectedVineyardId` currently
 * points at this vineyard, it's cleared too, so the app doesn't keep
 * pointing at a vineyard that no longer exists.
 *
 * This is the single path for removing a vineyard — the dev fixture's
 * delete button calls this too (see `devFixture.ts`), rather than keeping
 * its own partial copy that can drift out of sync with this one.
 */
export async function deleteVineyard(id: number): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.vineyards,
      db.growthStages,
      db.sprays,
      db.works,
      db.harvests,
      db.weatherCache,
      db.dailyRisk,
      db.infectionEvents,
      db.settings,
    ],
    async () => {
      await db.vineyards.delete(id)
      await db.growthStages.where('vineyardId').equals(id).delete()
      await db.sprays.where('vineyardId').equals(id).delete()
      await db.works.where('vineyardId').equals(id).delete()
      await db.harvests.where('vineyardId').equals(id).delete()
      await db.weatherCache.where('vineyardId').equals(id).delete()
      await db.dailyRisk.where('vineyardId').equals(id).delete()
      await db.infectionEvents.where('vineyardId').equals(id).delete()
      await db.settings.filter((row) => belongsToVineyard(row.key, id)).delete()

      const selected = await db.settings.where('key').equals(SETTINGS_KEYS.selectedVineyardId).first()
      if (selected?.id !== undefined && selected.value === id) {
        await db.settings.delete(selected.id)
      }
    },
  )
}
