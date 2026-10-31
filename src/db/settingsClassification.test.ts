/**
 * File: settingsClassification.test.ts
 * Created: 2026-10-20
 * Description: Tests that every settings key the app writes is classified as user or derived.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { db } from './index'
import type { HourlyWeather, Vineyard } from './schema'
import { setSetting } from './settingsRepo'
import { SETTINGS_KEYS } from './settingsKeys'
import { classifySettingsKey } from './settingsClassification'
import { syncVineyardSeasonState } from '../features/risk/syncSeasonState'

describe('classifySettingsKey', () => {
  it("classifies every key in SETTINGS_KEYS as 'user'", () => {
    for (const key of Object.values(SETTINGS_KEYS)) {
      expect(classifySettingsKey(key)).toBe('user')
    }
  })

  it("classifies every known derived-state key prefix as 'derived'", () => {
    expect(classifySettingsKey('degreeSum:1:2026:cz-morava')).toBe('derived')
    expect(classifySettingsKey('goidanichState:1:2026')).toBe('derived')
    expect(classifySettingsKey('gublerThomasState:1:2026')).toBe('derived')
    expect(classifySettingsKey('daySource:1:2026')).toBe('derived')
    expect(classifySettingsKey('lastSeasonSync:1')).toBe('derived')
  })

  it("flags an unrecognized key as 'unknown' — this is what catches a settings write nobody classified", () => {
    expect(classifySettingsKey('someBrandNewSetting')).toBe('unknown')
    expect(classifySettingsKey('selectedVineyardIdButTypoed')).toBe('unknown')
  })
})

describe('every settings key the app actually writes is classified (not unknown)', () => {
  const VINEYARD_ID = 777000111
  const year = new Date().getFullYear()
  const budbreak = `${year}-04-01`

  function hourlyForDay(date: string, temperature2m: number, relativeHumidity2m = 50, precipitation = 0): HourlyWeather[] {
    return Array.from({ length: 24 }, (_, hour) => ({
      time: `${date}T${String(hour).padStart(2, '0')}:00`,
      temperature2m,
      relativeHumidity2m,
      dewPoint2m: 0,
      precipitation,
    }))
  }

  async function cleanup() {
    await db.vineyards.delete(VINEYARD_ID)
    await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).delete()
    await db.dailyRisk.where('vineyardId').equals(VINEYARD_ID).delete()
    await db.settings.filter((row) => row.key.includes(String(VINEYARD_ID))).delete()
    await db.settings.where('key').equals(SETTINGS_KEYS.sprayWarningDays).delete()
  }
  afterEach(cleanup)

  it('exercises a user setting write plus a full season sync, then checks every settings key', async () => {
    await setSetting(SETTINGS_KEYS.sprayWarningDays, 5)

    const now = new Date().toISOString()
    const vineyard: Vineyard = {
      id: VINEYARD_ID,
      name: 'Classification test',
      lat: 49.0,
      lon: 17.0,
      regionProfile: 'cz-morava',
      varietyId: 1,
      plantedYear: 2020,
      createdAt: now,
      updatedAt: now,
    }

    // 18 days reaching 180 DS, rain on the last day, to trigger a primary
    // event — this exercises degreeSum, goidanichState, daySource and
    // lastSeasonSync writes (gublerThomasState is written unconditionally).
    const hourly: HourlyWeather[] = []
    const start = Date.UTC(year, 3, 1)
    for (let i = 0; i < 18; i++) {
      const date = new Date(start + i * 86400000).toISOString().slice(0, 10)
      hourly.push(...hourlyForDay(date, 18, 50, i === 17 ? 15 : 0))
    }
    await syncVineyardSeasonState(vineyard, { budbreak }, hourly, { fetchHistoricalHourly: async () => [] })

    const allKeys = (await db.settings.toArray()).map((row) => row.key)
    expect(allKeys.length).toBeGreaterThan(1) // sanity: this actually wrote several keys
    for (const key of allKeys) {
      expect(classifySettingsKey(key)).not.toBe('unknown')
    }
  })
})
