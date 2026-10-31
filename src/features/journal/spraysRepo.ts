/**
 * File: spraysRepo.ts
 * Created: 2026-10-03
 * Description: Database access for spray records, including the last spray date.
 */

import { db } from '../../db'
import type { Spray, SprayTarget } from '../../db/schema'

export type SprayInput = Omit<Spray, 'id' | 'createdAt' | 'updatedAt'>

export function listSpraysForVineyard(vineyardId: number) {
  return db.sprays.where('vineyardId').equals(vineyardId).reverse().sortBy('datetime')
}

export async function addSpray(input: SprayInput): Promise<number> {
  const now = new Date().toISOString()
  const id = await db.sprays.add({ ...input, createdAt: now, updatedAt: now })
  return id as number
}

export async function deleteSpray(id: number): Promise<void> {
  await db.sprays.delete(id)
}

export async function getLastSprayDatetime(vineyardId: number, target: SprayTarget): Promise<string | null> {
  const rows = await db.sprays
    .where('vineyardId')
    .equals(vineyardId)
    .and((s) => s.target === target)
    .sortBy('datetime')
  return rows.length > 0 ? rows[rows.length - 1].datetime : null
}
