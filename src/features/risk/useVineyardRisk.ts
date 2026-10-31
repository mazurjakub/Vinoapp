/**
 * File: useVineyardRisk.ts
 * Created: 2026-10-20
 * Description: React hook that combines weather, rules and saved state into the risk shown for a plot.
 */

import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { HourlyWeather, InfectionEvent } from '../../db/schema'
import { getSetting } from '../../db/settingsRepo'
import {
  addDaysUTC,
  daysBetween,
  downyMildewPrimaryRisk,
  goidanichSecondaryRisk,
  initialGoidanichCycleState,
  normalizeGoidanichCycleState,
  powderyMildewGublerThomasRisk,
  REGION_PROFILES,
  resolveGublerStart,
  secondarySeasonEnded,
  type GoidanichCycleState,
  type GublerThomasState,
} from '../../rules'
import { localDateKey } from '../weather/format'
import { getWeatherCache } from '../weather/weatherCacheRepo'
import { getPhenologyDatesForYear } from '../growthStage/growthStageRepo'
import { getLastSprayDatetime } from '../journal/spraysRepo'
import { countSeasonInfectionEvents, isActiveInfectionEvent } from './infectionEventsRepo'
import { resolveGoidanichActiveSince } from './goidanichActivation'
import { syncVineyardSeasonStateOnce, type SyncSeasonStateResult } from './syncSeasonState'
import type { DailyAccumulatorRecord } from './dailyAccumulator'

/** Only the hours from `fromDateInclusive` onward (display window for whatever hasn't been persisted yet). */
function filterHourlyFrom(hourly: HourlyWeather[], fromDateInclusive: string): HourlyWeather[] {
  return hourly.filter((h) => h.time.slice(0, 10) >= fromDateInclusive)
}

export function useVineyardRisk(vineyardId: number | undefined) {
  const vineyard = useLiveQuery(() => (vineyardId ? db.vineyards.get(vineyardId) : undefined), [vineyardId])
  const cache = useLiveQuery(
    () => (vineyardId ? getWeatherCache(vineyardId) : undefined),
    [vineyardId],
  )
  const year = new Date().getFullYear()
  const phenology = useLiveQuery(
    () => (vineyardId ? getPhenologyDatesForYear(vineyardId, year) : undefined),
    [vineyardId, year],
  )
  const seasonEventCount = useLiveQuery(
    () => (vineyardId ? countSeasonInfectionEvents(vineyardId, year, 'downy', 'primary') : undefined),
    [vineyardId, year],
  )
  const seasonPrimaryEvents = useLiveQuery<InfectionEvent[] | undefined>(
    () =>
      vineyardId
        ? db.infectionEvents
            .where('vineyardId')
            .equals(vineyardId)
            .and((e) => isActiveInfectionEvent(e) && e.disease === 'downy' && e.type === 'primary' && e.date.startsWith(String(year)))
            .sortBy('date')
        : undefined,
    [vineyardId, year],
  )
  const lastDownySprayDatetime = useLiveQuery(
    () => (vineyard ? getLastSprayDatetime(vineyard.id!, 'downy') : undefined),
    [vineyard?.id],
  )
  const lastPowderySprayDatetime = useLiveQuery(
    () => (vineyard ? getLastSprayDatetime(vineyard.id!, 'powdery') : undefined),
    [vineyard?.id],
  )
  const goidanichActiveSince = resolveGoidanichActiveSince(
    seasonPrimaryEvents?.map((e) => e.date) ?? [],
    lastDownySprayDatetime?.slice(0, 10),
  )

  // Persisted, season-long state for the three cumulative rules — read
  // reactively so the display updates once `syncVineyardSeasonState` (below)
  // writes new data.
  const degreeSumRecord = useLiveQuery(
    () =>
      vineyard
        ? getSetting<DailyAccumulatorRecord<number>>(`degreeSum:${vineyard.id}:${year}:${vineyard.regionProfile}`)
        : undefined,
    [vineyard?.id, vineyard?.regionProfile, year],
  )
  const goidanichRecord = useLiveQuery(
    () =>
      vineyard && goidanichActiveSince
        ? getSetting<DailyAccumulatorRecord<GoidanichCycleState>>(`goidanichState:${vineyard.id}:${year}`)
        : undefined,
    [vineyard?.id, year, goidanichActiveSince],
  )
  const gublerThomasRecord = useLiveQuery(
    () => (vineyard ? getSetting<DailyAccumulatorRecord<GublerThomasState>>(`gublerThomasState:${vineyard.id}:${year}`) : undefined),
    [vineyard?.id, year],
  )
  // Whether the last attempt to sync season-long state (SET8,0, Goidanich,
  // Gubler-Thomas) against Open-Meteo actually succeeded — surfaced so the UI
  // can warn that the displayed risk may be based on incomplete history
  // instead of silently looking current when it isn't (a network error here
  // never changes any already-persisted state, see syncVineyardSeasonState).
  const lastSeasonSync = useLiveQuery(
    () => (vineyard ? getSetting<SyncSeasonStateResult>(`lastSeasonSync:${vineyard.id}`) : undefined),
    [vineyard?.id],
  )

  function daysSince(datetime: string | null | undefined): number | null {
    if (!datetime) return null
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return daysBetween(datetime.slice(0, 10), todayKey)
  }

  const risk = useMemo(() => {
    if (!vineyard || !cache || !phenology) return undefined

    const profile = REGION_PROFILES[vineyard.regionProfile]

    // Primary: start from the persisted degree-sum (as of its lastProcessedDate)
    // and only layer today + the forecast on top for display — never
    // re-summing days already folded into the persisted total.
    const primaryFrom = degreeSumRecord?.lastProcessedDate
      ? addDaysUTC(degreeSumRecord.lastProcessedDate, 1)
      : (phenology.budbreak ?? '0000-01-01')
    const primary = downyMildewPrimaryRisk(
      filterHourlyFrom(cache.hourly, primaryFrom),
      phenology,
      profile,
      degreeSumRecord?.state,
    )

    // Only trust the stored record if it was computed from the same
    // activation date — a stale one (from before a spray deactivated the
    // index, with a sync still pending) must not leak into the display.
    const matchingGoidanichRecord =
      goidanichRecord?.resetFromDate === goidanichActiveSince ? goidanichRecord : undefined
    const secondary = goidanichActiveSince
      ? (() => {
          const secondaryFrom = matchingGoidanichRecord?.lastProcessedDate
            ? addDaysUTC(matchingGoidanichRecord.lastProcessedDate, 1)
            : goidanichActiveSince
          return goidanichSecondaryRisk(
            cache.hourly,
            secondaryFrom,
            matchingGoidanichRecord
              ? normalizeGoidanichCycleState(matchingGoidanichRecord.state, goidanichActiveSince)
              : initialGoidanichCycleState(),
            {
              primaryEventDates: new Set(seasonPrimaryEvents?.map((e) => e.date)),
              stallDays: profile.secondaryInfection.stallDays,
              requireWetHours: profile.secondaryInfection.requireWetHours,
              newInfectionDates: new Set(primary.filter((r) => r.risk === 'high').map((r) => r.date)),
            },
          ).filter(
            (r) => !secondarySeasonEnded(r.date, phenology.harvest, profile.secondaryInfection.seasonEndMonthDay),
          )
        })()
      : []

    const gublerStart = resolveGublerStart(phenology.budbreak ?? `${year}-01-01`, lastPowderySprayDatetime?.slice(0, 10))
    const matchingGublerRecord =
      gublerThomasRecord?.resetFromDate === gublerStart.resetFromDate ? gublerThomasRecord : undefined
    const powderyFrom = matchingGublerRecord?.lastProcessedDate
      ? addDaysUTC(matchingGublerRecord.lastProcessedDate, 1)
      : gublerStart.resetFromDate
    const powdery = powderyMildewGublerThomasRisk(
      filterHourlyFrom(cache.hourly, powderyFrom),
      matchingGublerRecord?.state ?? gublerStart.initialState,
    )

    return { primary, secondary, powdery, fetchedAt: cache.fetchedAt }
  }, [
    vineyard,
    cache,
    phenology,
    degreeSumRecord,
    goidanichRecord,
    gublerThomasRecord,
    goidanichActiveSince,
    seasonPrimaryEvents,
    lastPowderySprayDatetime,
    year,
  ])

  // Keeps the persisted season-long state (SET8,0 sum, Goidanich index,
  // Gubler-Thomas index, and recorded infection events) up to date. Skipped
  // when nothing changed since the last sync, such as right after a weather
  // refresh already ran it (see syncVineyardSeasonStateOnce).
  useEffect(() => {
    if (vineyard && phenology && cache) {
      void syncVineyardSeasonStateOnce(vineyard, phenology, cache.hourly)
    }
  }, [vineyard, phenology, cache])

  const todayStatus = risk?.secondary.find((r) => r.date === localDateKey(new Date()))?.cycleStatus

  return risk
    ? {
        ...risk,
        secondaryActive: todayStatus === 'running' || todayStatus === 'complete',
        seasonEventCount,
        lastSeasonSync,
        daysSinceDownySpray: daysSince(lastDownySprayDatetime),
        daysSincePowderySpray: daysSince(lastPowderySprayDatetime),
      }
    : undefined
}
