/**
 * File: devFixture.ts
 * Created: 2026-10-20
 * Description: Creates and removes a synthetic development plot for checking the weather chart.
 */

import { db } from '../../db'
import type { DailyRisk, HourlyWeather } from '../../db/schema'
import { setSetting } from '../../db/settingsRepo'
import { SETTINGS_KEYS } from '../../db/settingsKeys'
import { addDaysUTC, daysBetween } from '../../rules'
import { localDateKey } from '../weather/format'
import { saveWeatherCache } from '../weather/weatherCacheRepo'
import { deleteVineyard } from '../vineyards/vineyardsRepo'

/**
 * Dev-only: a dedicated vineyard so seeding/deleting the chart fixture can
 * never touch the user's real data. Never imported from a production code
 * path; see `DevFixtureButton.tsx`, which only renders in `import.meta.env.DEV`.
 */
export const DEV_FIXTURE_VINEYARD_NAME = 'DEV fixture'

async function getOrCreateDevVineyard(): Promise<number> {
  const existing = await db.vineyards.where('name').equals(DEV_FIXTURE_VINEYARD_NAME).first()
  if (existing?.id !== undefined) return existing.id

  const now = new Date().toISOString()
  const id = await db.vineyards.add({
    name: DEV_FIXTURE_VINEYARD_NAME,
    lat: 49.0,
    lon: 16.9,
    regionProfile: 'cz-morava',
    varietyId: 1,
    plantedYear: 2020,
    createdAt: now,
    updatedAt: now,
  })
  return id as number
}

/**
 * Seeds synthetic spring/summer `dailyRisk` rows, a matching primary
 * infection event and a minimal `weatherCache`, into the dedicated "DEV
 * fixture" vineyard (creating it if needed) and selects it — so the weather
 * chart's layout can be checked against real variety (archive/forecast
 * boundary, an inactive-then-reactivated Goidanich gap, a Gubler-Thomas
 * ramp) without a real weather fetch and without touching any real vineyard.
 */
export async function seedWeatherChartDevFixture(): Promise<number> {
  const vineyardId = await getOrCreateDevVineyard()
  const today = localDateKey(new Date())
  const from = addDaysUTC(today, -30)
  const to = addDaysUTC(today, 7)
  const eventDate = addDaysUTC(today, -20)
  const sprayDate = addDaysUTC(today, -12)
  const reactivationDate = addDaysUTC(today, -6)

  const rows: DailyRisk[] = []
  const hourly: HourlyWeather[] = []
  for (let date = from; date <= to; date = addDaysUTC(date, 1)) {
    const i = daysBetween(from, date)
    const isForecast = date > today
    const meanTempC = 14 + 8 * Math.sin(i / 5) + (isForecast ? 2 : 0)
    const precipitationMm = i % 6 === 0 ? 8 + (i % 3) : 0
    const meanRhPct = 55 + 25 * Math.cos(i / 6)

    // Active from the primary event until the spray, null (inactive) in
    // between, active again from the reactivating event — exercises the
    // layout's forecast band and the Goidanich null-gap rendering together.
    const goidanichPct =
      date >= eventDate && date < sprayDate
        ? Math.min(100, (daysBetween(eventDate, date) + 1) * 6)
        : date >= reactivationDate
          ? Math.min(60, (daysBetween(reactivationDate, date) + 1) * 8)
          : null

    const gublerScore = i > 4 ? Math.min(100, Math.max(0, (i - 4) * 3.5)) : null

    rows.push({
      vineyardId,
      date,
      source: isForecast ? 'forecast' : 'archive',
      meanTempC,
      precipitationMm,
      meanRhPct,
      goidanichPct,
      gublerScore,
    })

    for (let hour = 0; hour < 24; hour++) {
      hourly.push({
        time: `${date}T${String(hour).padStart(2, '0')}:00`,
        temperature2m: meanTempC,
        relativeHumidity2m: meanRhPct,
        dewPoint2m: meanTempC - 4,
        precipitation: hour === 6 ? precipitationMm : 0,
      })
    }
  }

  await db.dailyRisk.where('vineyardId').equals(vineyardId).delete()
  await db.dailyRisk.bulkAdd(rows)
  await saveWeatherCache(vineyardId, hourly)

  const now = new Date().toISOString()
  const existingEvent = await db.infectionEvents
    .where('vineyardId')
    .equals(vineyardId)
    .and((e) => e.date === eventDate && e.disease === 'downy' && e.type === 'primary')
    .first()
  if (!existingEvent) {
    await db.infectionEvents.add({
      vineyardId,
      date: eventDate,
      disease: 'downy',
      type: 'primary',
      rule: 'dev-fixture',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
  }

  await setSetting(SETTINGS_KEYS.selectedVineyardId, vineyardId)
  return vineyardId
}

/**
 * Removes the DEV fixture vineyard and everything that belongs to it. No-op
 * if it doesn't exist. Goes through `deleteVineyard` — the same path the
 * app's own delete button uses — rather than its own partial copy, so a
 * fix to what counts as "everything" (see `vineyardsRepo.ts`) can't apply to
 * one and not the other.
 */
export async function deleteWeatherChartDevFixture(): Promise<void> {
  const vineyard = await db.vineyards.where('name').equals(DEV_FIXTURE_VINEYARD_NAME).first()
  if (vineyard?.id === undefined) return
  await deleteVineyard(vineyard.id)
}
