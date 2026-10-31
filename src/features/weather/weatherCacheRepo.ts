/**
 * File: weatherCacheRepo.ts
 * Created: 2026-10-02
 * Description: Database access for the cached weather data.
 */

import { db } from '../../db'
import type { HourlyWeather } from '../../db/schema'

export function getWeatherCache(vineyardId: number) {
  return db.weatherCache.where('vineyardId').equals(vineyardId).first()
}

export async function saveWeatherCache(
  vineyardId: number,
  hourly: HourlyWeather[],
): Promise<void> {
  const fetchedAt = new Date().toISOString()
  const existing = await db.weatherCache.where('vineyardId').equals(vineyardId).first()
  if (existing?.id !== undefined) {
    await db.weatherCache.update(existing.id, { fetchedAt, hourly })
  } else {
    await db.weatherCache.add({ vineyardId, fetchedAt, hourly })
  }
}
