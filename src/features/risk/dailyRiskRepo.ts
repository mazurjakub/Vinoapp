/**
 * File: dailyRiskRepo.ts
 * Created: 2026-10-03
 * Description: Database access for the daily risk snapshots.
 */

import { db } from '../../db'
import type { DailyRisk } from '../../db/schema'

/** Fields a sync pass may write; anything else on a row is left alone. */
export type DailyRiskPatch = Partial<Omit<DailyRisk, 'id' | 'vineyardId' | 'date'>> & { date: string }

/** Merges patches into the snapshot rows, `undefined` fields keep the stored value. */
export async function upsertDailyRisk(vineyardId: number, patches: DailyRiskPatch[]): Promise<void> {
  if (patches.length === 0) return
  await db.transaction('rw', db.dailyRisk, async () => {
    for (const patch of patches) {
      const existing = await db.dailyRisk.where('[vineyardId+date]').equals([vineyardId, patch.date]).first()
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
      if (existing?.id !== undefined) {
        await db.dailyRisk.update(existing.id, defined)
      } else {
        await db.dailyRisk.add({ vineyardId, source: 'forecast', ...defined } as DailyRisk)
      }
    }
  })
}

/** Snapshot rows for `[fromDate, toDate]` inclusive, oldest first. */
export async function listDailyRiskWindow(vineyardId: number, fromDate: string, toDate: string): Promise<DailyRisk[]> {
  const rows = await db.dailyRisk
    .where('vineyardId')
    .equals(vineyardId)
    .and((row) => row.date >= fromDate && row.date <= toDate)
    .toArray()
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}
