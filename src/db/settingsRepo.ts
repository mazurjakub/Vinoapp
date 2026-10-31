/**
 * File: settingsRepo.ts
 * Created: 2026-10-02
 * Description: Helpers for reading, writing and deleting settings in the database.
 */

import { db } from './index'

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.where('key').equals(key).first()
  return row?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const row = await db.settings.where('key').equals(key).first()
  if (row?.id !== undefined) {
    await db.settings.update(row.id, { value })
  } else {
    await db.settings.add({ key, value })
  }
}

export async function deleteSetting(key: string): Promise<void> {
  const row = await db.settings.where('key').equals(key).first()
  if (row?.id !== undefined) {
    await db.settings.delete(row.id)
  }
}
