/**
 * File: useWeather.ts
 * Created: 2026-10-25
 * Description: React hook that reads cached weather and refreshes the forecast for a plot.
 */

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Vineyard } from '../../db/schema'
import { openMeteoProvider } from '../../weather/openMeteoProvider'
import { getPhenologyDatesForYear } from '../growthStage/growthStageRepo'
import { syncVineyardSeasonState } from '../risk/syncSeasonState'
import { getWeatherCache, saveWeatherCache } from './weatherCacheRepo'

export function useWeather(vineyard: Vineyard | undefined) {
  const cache = useLiveQuery(
    () => (vineyard?.id ? getWeatherCache(vineyard.id) : undefined),
    [vineyard?.id],
  )
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)

  const refresh = async () => {
    if (!vineyard?.id) return
    setRefreshing(true)
    setFailed(false)
    try {
      const hourly = await openMeteoProvider.fetchHourly(vineyard.lat, vineyard.lon)
      await saveWeatherCache(vineyard.id, hourly)
      // The chart reads the dailyRisk snapshots, so run the sync after a refresh.
      const phenology = await getPhenologyDatesForYear(vineyard.id, new Date().getFullYear())
      await syncVineyardSeasonState(vineyard, phenology, hourly)
    } catch {
      setFailed(true)
    } finally {
      setRefreshing(false)
    }
  }

  return { cache, refresh, refreshing, failed }
}
