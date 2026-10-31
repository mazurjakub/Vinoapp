/**
 * File: worksRepo.ts
 * Created: 2026-10-03
 * Description: Database access for work records.
 */

import { db } from '../../db'
import type { Work } from '../../db/schema'

export type WorkInput = Omit<Work, 'id' | 'createdAt' | 'updatedAt'>

export function listWorksForVineyard(vineyardId: number) {
  return db.works.where('vineyardId').equals(vineyardId).reverse().sortBy('datetime')
}

export async function addWork(input: WorkInput): Promise<number> {
  const now = new Date().toISOString()
  const id = await db.works.add({ ...input, createdAt: now, updatedAt: now })
  return id as number
}

export async function deleteWork(id: number): Promise<void> {
  await db.works.delete(id)
}
