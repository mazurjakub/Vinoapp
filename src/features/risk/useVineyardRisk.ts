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
import { DEFAULT_SPRAY_WARNING_DAYS, SETTINGS_KEYS } from '../../db/settingsKeys'
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
import { getSprayIntervalAnchors, hasHighRiskAhead, sprayIntervalWarning } from './sprayInterval'

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

  // Stored season state, updates when the sync writes.
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
  const sprayWarningDays = useLiveQuery(() => getSetting<number>(SETTINGS_KEYS.sprayWarningDays), [])
  const downySprayAnchors = useLiveQuery(
    () => (vineyardId ? getSprayIntervalAnchors(vineyardId, year, 'downy') : undefined),
    [vineyardId, year],
  )
  const powderySprayAnchors = useLiveQuery(
    () => (vineyardId ? getSprayIntervalAnchors(vineyardId, year, 'powdery', phenology?.budbreak) : undefined),
    [vineyardId, year, phenology?.budbreak],
  )
  // Whether the last sync succeeded, so the UI can warn about incomplete data.
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

    // Stored degree sum, with today and the forecast on top.
    const primaryFrom = degreeSumRecord?.lastProcessedDate
      ? addDaysUTC(degreeSumRecord.lastProcessedDate, 1)
      : (phenology.budbreak ?? '0000-01-01')
    const primary = downyMildewPrimaryRisk(
      filterHourlyFrom(cache.hourly, primaryFrom),
      phenology,
      profile,
      degreeSumRecord?.state,
    )

    // Ignore a stored record from a different activation date (e.g. from before a spray).
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
              thresholds: profile.secondaryInfection.thresholdsPct,
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

    const today = localDateKey(new Date())
    const sprayWarning = (anchors: typeof downySprayAnchors, results: typeof primary) =>
      anchors
        ? sprayIntervalWarning({
            ...anchors,
            today,
            warningDays: sprayWarningDays ?? DEFAULT_SPRAY_WARNING_DAYS,
            harvestDate: phenology.harvest,
            seasonEndMonthDay: profile.secondaryInfection.seasonEndMonthDay,
            highRiskAhead: hasHighRiskAhead(results, today),
          })
        : null

    return {
      primary,
      secondary,
      powdery,
      fetchedAt: cache.fetchedAt,
      downySprayWarning: sprayWarning(downySprayAnchors, [...primary, ...secondary]),
      powderySprayWarning: sprayWarning(powderySprayAnchors, powdery),
    }
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
    sprayWarningDays,
    downySprayAnchors,
    powderySprayAnchors,
  ])

  // Sync the season state, skipped when nothing changed.
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
