/**
 * File: devFixture.ts
 * Created: 2026-10-20
 * Description: Creates and removes a synthetic development plot for checking the weather chart.
 */

import { db } from '../../db'
import type { DailyRisk, HourlyWeather } from '../../db/schema'
import { setSetting } from '../../db/settingsRepo'
import { SETTINGS_KEYS } from '../../db/settingsKeys'
import {
  addDaysUTC,
  goidanichDisplayPct,
  groupByDay,
  initialGoidanichCycleState,
  initialGublerThomasState,
  REGION_PROFILES,
  type GoidanichCycleState,
} from '../../rules'
import { gublerStep, makeGoidanichStep } from '../risk/accumulatorSteps'
import { localDateKey } from '../weather/format'
import { saveWeatherCache } from '../weather/weatherCacheRepo'
import { deleteVineyard } from '../vineyards/vineyardsRepo'

/**
 * Dev-only: a dedicated vineyard so seeding/deleting the chart fixture can
 * never touch the user's real data. Never imported from a production code
 * path; see `DevFixtureButton.tsx`, which only renders in `import.meta.env.DEV`.
 */
export const DEV_FIXTURE_VINEYARD_NAME = 'DEV fixture'

/**
 * - `active`: a cycle stopped by a downy spray, a new one after it that reaches 100% in the forecast.
 * - `cold`: a running cycle that stands still in cold weather.
 * - `offSeason`: a harvest a few days ago, so the season is over.
 */
export type DevFixtureVariant = 'active' | 'cold' | 'offSeason'

interface VariantPlan {
  /** Day offsets from today. */
  events: number[]
  spray?: number
  harvest: number
  weather: (offset: number) => { tempC: number; rhPct: number }
}

const PLANS: Record<DevFixtureVariant, VariantPlan> = {
  active: {
    events: [-14, -3],
    spray: -6,
    harvest: 60,
    weather: (offset) => ({ tempC: 19 + 2 * Math.sin(offset / 3), rhPct: 82 }),
  },
  cold: {
    events: [-10],
    harvest: 60,
    weather: (offset) => (offset < -7 ? { tempC: 19, rhPct: 80 } : { tempC: 8 + 2 * Math.sin(offset), rhPct: 85 }),
  },
  offSeason: {
    events: [-15],
    harvest: -4,
    weather: (offset) => ({ tempC: 15 + 3 * Math.sin(offset / 4), rhPct: 75 }),
  },
}

async function createDevVineyard(): Promise<number> {
  const now = new Date().toISOString()
  return (await db.vineyards.add({
    name: DEV_FIXTURE_VINEYARD_NAME,
    lat: 49.0,
    lon: 16.9,
    regionProfile: 'cz-morava',
    varietyId: 1,
    plantedYear: 2020,
    createdAt: now,
    updatedAt: now,
  })) as number
}

/**
 * Seeds one of the chart states into the dedicated "DEV fixture" vineyard
 * (recreated each time) and selects it. The stored index values come from the
 * same engine steps as a real sync, and today and the forecast are left to the
 * chart's own projection, so the chart shows what it would show for real data.
 */
export async function seedWeatherChartDevFixture(variant: DevFixtureVariant = 'active'): Promise<number> {
  await deleteWeatherChartDevFixture()
  const vineyardId = await createDevVineyard()
  const plan = PLANS[variant]
  const today = localDateKey(new Date())
  const from = addDaysUTC(today, -30)
  const at = (offset: number) => addDaysUTC(today, offset)
  const eventDates = plan.events.map(at)
  const sprayDate = plan.spray === undefined ? undefined : at(plan.spray)
  const harvestDate = at(plan.harvest)
  const profile = REGION_PROFILES['cz-morava'].secondaryInfection

  const hourly: HourlyWeather[] = []
  for (let offset = -30; offset <= 7; offset++) {
    const date = at(offset)
    const { tempC, rhPct } = plan.weather(offset)
    for (let hour = 0; hour < 24; hour++) {
      hourly.push({
        time: `${date}T${String(hour).padStart(2, '0')}:00`,
        temperature2m: tempC,
        relativeHumidity2m: rhPct,
        dewPoint2m: tempC - 3,
        precipitation: offset % 6 === 0 && hour === 6 ? 6 : 0,
      })
    }
  }

  // Elapsed days only, as a sync would store them.
  const goidanichStep = makeGoidanichStep({
    primaryEventDates: new Set(eventDates),
    stallDays: profile.stallDays,
    thresholds: profile.thresholdsPct,
  })
  let goidanich: GoidanichCycleState = initialGoidanichCycleState()
  let gubler = initialGublerThomasState()
  const rows: DailyRisk[] = []
  for (const day of groupByDay(hourly).filter((d) => d.date < today)) {
    if (sprayDate && day.date === sprayDate) goidanich = initialGoidanichCycleState()
    // After a spray, only an event after it starts a cycle.
    const active = !sprayDate || day.date < sprayDate || eventDates.some((e) => e > sprayDate && e <= day.date)
    goidanich = active ? goidanichStep(goidanich, day) : goidanich
    gubler = gublerStep(gubler, day)
    rows.push({
      vineyardId,
      date: day.date,
      source: 'archive',
      meanTempC: day.hours[0].temperature2m,
      precipitationMm: day.hours.reduce((sum, h) => sum + h.precipitation, 0),
      meanRhPct: day.hours[0].relativeHumidity2m,
      goidanichPct: active && day.date <= harvestDate ? goidanichDisplayPct(goidanich, day.date) : null,
      gublerScore: gubler.ignited ? gubler.score : null,
    })
  }

  const now = new Date().toISOString()
  await db.dailyRisk.bulkAdd(rows)
  await saveWeatherCache(vineyardId, hourly)
  await db.growthStages.bulkAdd([
    { vineyardId, year: Number(today.slice(0, 4)), stage: 'budbreak', date: from, createdAt: now, updatedAt: now },
    { vineyardId, year: Number(today.slice(0, 4)), stage: 'harvest', date: harvestDate, createdAt: now, updatedAt: now },
  ])
  await db.infectionEvents.bulkAdd(
    eventDates.map((date) => ({
      vineyardId,
      date,
      disease: 'downy' as const,
      type: 'primary' as const,
      rule: 'dev-fixture',
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    })),
  )
  if (sprayDate) {
    await db.sprays.add({
      vineyardId,
      datetime: `${sprayDate}T08:00`,
      product: 'DEV',
      activeSubstance: 'DEV',
      dose: '-',
      target: 'downy',
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
  const vineyards = await db.vineyards.where('name').equals(DEV_FIXTURE_VINEYARD_NAME).toArray()
  for (const vineyard of vineyards) {
    if (vineyard.id !== undefined) await deleteVineyard(vineyard.id)
  }
}
