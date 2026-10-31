/**
 * File: harvestsRepo.ts
 * Created: 2026-10-03
 * Description: Database access for harvest records.
 */

import { db } from '../../db'
import type { Harvest } from '../../db/schema'

export type HarvestInput = Omit<Harvest, 'id' | 'createdAt' | 'updatedAt'>

export function listHarvestsForVineyard(vineyardId: number) {
  return db.harvests.where('vineyardId').equals(vineyardId).reverse().sortBy('date')
}

export async function addHarvest(input: HarvestInput): Promise<number> {
  const now = new Date().toISOString()
  const id = await db.harvests.add({ ...input, createdAt: now, updatedAt: now })
  return id as number
}

export async function deleteHarvest(id: number): Promise<void> {
  await db.harvests.delete(id)
}
