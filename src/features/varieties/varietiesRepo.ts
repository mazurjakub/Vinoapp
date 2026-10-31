/**
 * File: varietiesRepo.ts
 * Created: 2026-10-02
 * Description: Database access for grape varieties, finding or creating one by name.
 */

import { db } from '../../db'

export function listVarieties() {
  return db.varieties.orderBy('name').toArray()
}

/** Finds a variety by name, or creates one with default (unknown) susceptibility. */
export async function resolveVarietyId(name: string): Promise<number> {
  const trimmed = name.trim()
  const existing = await db.varieties.where('name').equals(trimmed).first()
  if (existing?.id !== undefined) return existing.id

  const now = new Date().toISOString()
  const id = await db.varieties.add({
    name: trimmed,
    isPiwi: false,
    susceptibility: { downy: 'medium', powdery: 'medium', botrytis: 'medium' },
    stageOffsetDays: 0,
    createdAt: now,
    updatedAt: now,
  })
  return id as number
}
