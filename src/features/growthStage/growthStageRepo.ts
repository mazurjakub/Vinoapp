/**
 * File: growthStageRepo.ts
 * Created: 2026-10-02
 * Description: Database access for growth stages, including the dates used by the rules.
 */

import { db } from '../../db'
import type { GrowthStage, GrowthStageType } from '../../db/schema'
import type { PhenologyDates } from '../../rules'

export type GrowthStageInput = {
  vineyardId: number
  stage: GrowthStageType
  date: string
}

export function listGrowthStagesForVineyard(vineyardId: number) {
  return db.growthStages.where('vineyardId').equals(vineyardId).reverse().sortBy('date')
}

export async function addGrowthStage(input: GrowthStageInput): Promise<number> {
  const now = new Date().toISOString()
  const year = Number(input.date.slice(0, 4))
  const record: Omit<GrowthStage, 'id'> = {
    vineyardId: input.vineyardId,
    stage: input.stage,
    date: input.date,
    year,
    createdAt: now,
    updatedAt: now,
  }
  const id = await db.growthStages.add(record)
  return id as number
}

export async function deleteGrowthStage(id: number): Promise<void> {
  await db.growthStages.delete(id)
}

/** Latest date per stage in the season. Without a harvest stage, the last harvest record counts (harvest can be done in parts). */
export async function getPhenologyDatesForYear(vineyardId: number, year: number): Promise<PhenologyDates> {
  const rows = await db.growthStages
    .where('vineyardId')
    .equals(vineyardId)
    .and((row) => row.year === year)
    .toArray()

  const dates: PhenologyDates = {}
  for (const row of rows) {
    const current = dates[row.stage]
    if (!current || row.date > current) {
      dates[row.stage] = row.date
    }
  }
  if (!dates.harvest) {
    const harvests = await db.harvests.where('vineyardId').equals(vineyardId).toArray()
    dates.harvest = harvests
      .filter((harvest) => harvest.date.startsWith(String(year)))
      .map((harvest) => harvest.date)
      .sort()
      .at(-1)
  }
  return dates
}
