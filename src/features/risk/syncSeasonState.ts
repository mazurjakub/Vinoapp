/**
 * File: syncSeasonState.ts
 * Created: 2026-10-20
 * Description: Brings a plot's season accumulators and daily snapshots up to date from weather data.
 */

import { db } from '../../db'
import type { HourlyWeather, Vineyard } from '../../db/schema'
import { getSetting, setSetting } from '../../db/settingsRepo'
import {
  REGION_PROFILES,
  addDaysUTC,
  dailyMeanHumidity,
  dailyMeanTemperature,
  dailyPrecipitation,
  downyMildewPrimaryRisk,
  GOIDANICH_ENGINE_VERSION,
  goidanichDisplayPct,
  groupByDay,
  initialGoidanichCycleState,
  resolveGublerStart,
  secondarySeasonEnded,
  type DayHours,
  type GoidanichCycleState,
  type GublerThomasState,
  type PhenologyDates,
} from '../../rules'
import { openMeteoProvider } from '../../weather/openMeteoProvider'
import { localDateKey } from '../weather/format'
import { isActiveInfectionEvent, recordPrimaryInfectionEvents, revokeUnconfirmedPrimaryEvents } from './infectionEventsRepo'
import { syncDailyAccumulator, type DailyAccumulatorRecord } from './dailyAccumulator'
import { gublerStep, makeGoidanichStep } from './accumulatorSteps'
import { resolveGoidanichActiveSince } from './goidanichActivation'
import { upsertDailyRisk, type DailyRiskPatch } from './dailyRiskRepo'

type FetchHistoricalHourly = typeof openMeteoProvider.fetchHourlyRange

/** Each sync downloads and recomputes this many days before today. Older days stay as they are. */
const RECOMPUTED_DAYS = 7

const degreeSumKey = (vineyardId: number, year: number, regionProfileId: string) =>
  `degreeSum:${vineyardId}:${year}:${regionProfileId}`
const goidanichKey = (vineyardId: number, year: number) => `goidanichState:${vineyardId}:${year}`
const gublerThomasKey = (vineyardId: number, year: number) => `gublerThomasState:${vineyardId}:${year}`
/** Written by older versions, whose seasons were computed from ERA5. Its presence asks for one replay. */
const legacySourceLogKey = (vineyardId: number, year: number) => `daySource:${vineyardId}:${year}`

async function ensureHistoricalCoverage(
  vineyard: Vineyard,
  neededFrom: string,
  cachedDays: DayHours[],
  today: string,
  fetchHistoricalHourly: FetchHistoricalHourly,
): Promise<DayHours[]> {
  const earliestCached = cachedDays[0]?.date
  if (earliestCached && neededFrom >= earliestCached) return cachedDays

  const gapEnd = earliestCached ? addDaysUTC(earliestCached, -1) : addDaysUTC(today, -1)
  if (neededFrom > gapEnd) return cachedDays

  const extra = await fetchHistoricalHourly(vineyard.lat, vineyard.lon, neededFrom, gapEnd)
  return [...groupByDay(extra), ...cachedDays]
}

function mergeDays(days: DayHours[], newerDays: DayHours[] | undefined): DayHours[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  newerDays?.forEach((d) => byDate.set(d.date, d))
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

interface SyncWindow {
  today: string
  /** The first day that gets recomputed. */
  start: string
  /** The freshly downloaded days from `start` to yesterday; `undefined` if the download failed. */
  days: DayHours[] | undefined
}

/**
 * Decides which days to process. Normally continues after lastProcessedDate. Days in the
 * recompute window are processed again from the checkpoint with fresh data. A fresh run
 * recomputes from resetFromDate, the old state is overwritten only after it succeeds.
 */
async function prepareSyncDays(
  vineyard: Vineyard,
  settingsKey: string,
  resetFromDate: string,
  elapsedCachedDays: DayHours[],
  window: SyncWindow,
  fetchHistoricalHourly: FetchHistoricalHourly,
  rebuild: boolean,
): Promise<{ days: DayHours[]; fresh: boolean; fromCheckpoint: boolean }> {
  const stored = await getSetting<DailyAccumulatorRecord<unknown>>(settingsKey)
  const resuming = Boolean(stored && stored.resetFromDate === resetFromDate && stored.lastProcessedDate)
  const inWindow = resuming && window.days !== undefined && stored!.lastProcessedDate >= window.start
  const checkpoint = stored?.checkpoint

  if (inWindow && !rebuild && checkpoint) {
    const firstDay = addDaysUTC(checkpoint.date, 1)
    const older =
      firstDay < window.start
        ? groupByDay(await fetchHistoricalHourly(vineyard.lat, vineyard.lon, firstDay, addDaysUTC(window.start, -1)))
        : []
    return { days: [...older, ...window.days!], fresh: false, fromCheckpoint: true }
  }
  if (inWindow && !rebuild && resetFromDate >= window.start) {
    return { days: window.days!, fresh: true, fromCheckpoint: false }
  }
  if (resuming && (rebuild || inWindow)) {
    const endDate = addDaysUTC(window.today, -1)
    if (resetFromDate > endDate) return { days: [], fresh: true, fromCheckpoint: false }
    const fresh = await fetchHistoricalHourly(vineyard.lat, vineyard.lon, resetFromDate, endDate)
    return { days: groupByDay(fresh), fresh: true, fromCheckpoint: false }
  }

  const neededFrom = resuming ? addDaysUTC(stored!.lastProcessedDate, 1) : resetFromDate
  const days = await ensureHistoricalCoverage(
    vineyard,
    neededFrom,
    mergeDays(elapsedCachedDays, window.days),
    window.today,
    fetchHistoricalHourly,
  )
  return { days, fresh: false, fromCheckpoint: false }
}

export interface SyncSeasonStateDeps {
  fetchHistoricalHourly?: FetchHistoricalHourly
}

export interface SyncSeasonStateResult {
  ok: boolean
  /** Which parts failed this call (e.g. "degreeSum", "goidanich", "gublerThomas"), if any. */
  failedSections: string[]
  syncedAt: string
}

const lastSyncKey = (vineyardId: number) => `lastSeasonSync:${vineyardId}`

/**
 * Keeps the season state (SET8,0, Goidanich, Gubler-Thomas) up to date, even though the
 * weather cache only holds a few days. Only elapsed days are stored, today and the forecast
 * are computed for display. If a download fails, that part keeps its old state and is
 * reported in `failedSections`.
 */
async function runSeasonSync(
  vineyard: Vineyard,
  phenology: PhenologyDates,
  cachedHourly: HourlyWeather[],
  deps: SyncSeasonStateDeps = {},
): Promise<SyncSeasonStateResult> {
  const syncedAt = new Date().toISOString()
  if (vineyard.id === undefined) return { ok: true, failedSections: [], syncedAt }

  const fetchHistoricalHourly = deps.fetchHistoricalHourly ?? openMeteoProvider.fetchHourlyRange
  const year = new Date().getFullYear()
  const today = localDateKey(new Date())
  const profile = REGION_PROFILES[vineyard.regionProfile]
  const elapsedCachedDays = groupByDay(cachedHourly).filter((d) => d.date < today)
  const failedSections: string[] = []

  // Every elapsed day seen this call (cache + anything fetched), for the weather part of the snapshots.
  const elapsedByDate = new Map<string, DayHours>(elapsedCachedDays.map((d) => [d.date, d]))
  const addElapsed = (days: DayHours[]) => days.forEach((d) => elapsedByDate.set(d.date, d))
  const snapshotPatches = new Map<string, DailyRiskPatch>()
  const patchFor = (date: string): DailyRiskPatch => {
    const existing = snapshotPatches.get(date) ?? { date }
    snapshotPatches.set(date, existing)
    return existing
  }

  // Skipped for a cache with nothing in the window: there is no recent state to correct then.
  const windowStart = addDaysUTC(today, -RECOMPUTED_DAYS)
  const yesterday = addDaysUTC(today, -1)
  let recentDays: DayHours[] | undefined
  if (elapsedCachedDays.some((d) => d.date >= windowStart)) {
    try {
      const fetched = groupByDay(await fetchHistoricalHourly(vineyard.lat, vineyard.lon, windowStart, yesterday))
      // With a day missing, folding from the checkpoint would lose it, so that counts as a failure too.
      if (fetched.length < RECOMPUTED_DAYS) throw new Error('incomplete download')
      recentDays = fetched
      addElapsed(fetched)
    } catch {
      failedSections.push('recentDays')
    }
  }
  const syncWindow: SyncWindow = { today, start: windowStart, days: recentDays }

  const legacyKey = legacySourceLogKey(vineyard.id, year)
  const legacySource = (await getSetting(legacyKey)) !== undefined
  // Missing snapshots (new table or after an import) force a replay too.
  const rebuildAll = legacySource || (await db.dailyRisk.where('vineyardId').equals(vineyard.id).count()) === 0

  // 1) SET8,0 degree-day sum
  if (phenology.budbreak) {
    try {
      const key = degreeSumKey(vineyard.id, year, vineyard.regionProfile)
      const priorSumBeforeSync = await getSetting<DailyAccumulatorRecord<number>>(key)

      const prepared = await prepareSyncDays(
        vineyard,
        key,
        phenology.budbreak,
        elapsedCachedDays,
        syncWindow,
        fetchHistoricalHourly,
        rebuildAll,
      )
      addElapsed(prepared.days)
      // Degree sum as of the day before the first processed day (0 after a fresh recompute).
      const storedSum = priorSumBeforeSync?.resetFromDate === phenology.budbreak ? priorSumBeforeSync : undefined
      const priorSum = prepared.fresh
        ? 0
        : prepared.fromCheckpoint
          ? (storedSum?.checkpoint?.state ?? 0)
          : (storedSum?.state ?? 0)

      const result = await syncDailyAccumulator<number>({
        settingsKey: key,
        resetFromDate: phenology.budbreak,
        initialState: 0,
        days: prepared.days,
        fresh: prepared.fresh,
        fromCheckpoint: prepared.fromCheckpoint,
        checkpointBefore: windowStart,
        step: (sum, day) => sum + Math.max(0, dailyMeanTemperature(day.hours) - profile.primaryInfection.oosporeDegreeSumBaseC),
      })

      // 2) Record new primary infection events
      if (result.newlyProcessedDays.length > 0) {
        const gapHourly = result.newlyProcessedDays.flatMap((d) => d.hours)
        const gapResults = downyMildewPrimaryRisk(gapHourly, phenology, profile, priorSum)
        await recordPrimaryInfectionEvents(vineyard.id, gapResults)
        if (prepared.fromCheckpoint) await revokeUnconfirmedPrimaryEvents(vineyard.id, gapResults)
      }
    } catch {
      failedSections.push('degreeSum')
    }
  }

  // 3) Goidanich, from the first primary event that isn't followed by a downy spray
  const seasonPrimaryEvents = await db.infectionEvents
    .where('vineyardId')
    .equals(vineyard.id)
    .and((e) => isActiveInfectionEvent(e) && e.disease === 'downy' && e.type === 'primary' && e.date.startsWith(String(year)))
    .sortBy('date')
  const downySprayDates = (
    await db.sprays
      .where('vineyardId')
      .equals(vineyard.id)
      .and((s) => s.target === 'downy')
      .toArray()
  )
    .map((s) => s.datetime.slice(0, 10))
    .sort()
  const latestDownySprayDate = downySprayDates[downySprayDates.length - 1]
  const goidanichActiveSince = resolveGoidanichActiveSince(
    seasonPrimaryEvents.map((e) => e.date),
    latestDownySprayDate,
  )

  if (goidanichActiveSince) {
    try {
      const key = goidanichKey(vineyard.id, year)
      // A state from an older calculation stays stored until the replay has
      // finished, so a failed fetch leaves it in place.
      const storedGoidanich = await getSetting<DailyAccumulatorRecord<Partial<GoidanichCycleState>>>(key)
      const outdatedCalculation =
        storedGoidanich !== undefined && storedGoidanich.state.engineVersion !== GOIDANICH_ENGINE_VERSION
      const prepared = await prepareSyncDays(
        vineyard,
        key,
        goidanichActiveSince,
        elapsedCachedDays,
        syncWindow,
        fetchHistoricalHourly,
        rebuildAll || outdatedCalculation,
      )
      addElapsed(prepared.days)

      const pctByDate = new Map<string, number | null>()
      await syncDailyAccumulator<GoidanichCycleState>({
        settingsKey: key,
        resetFromDate: goidanichActiveSince,
        initialState: initialGoidanichCycleState(),
        days: prepared.days,
        fresh: prepared.fresh,
        fromCheckpoint: prepared.fromCheckpoint,
        checkpointBefore: windowStart,
        step: makeGoidanichStep({
          primaryEventDates: new Set(seasonPrimaryEvents.map((e) => e.date)),
          stallDays: profile.secondaryInfection.stallDays,
          thresholds: profile.secondaryInfection.thresholdsPct,
          requireWetHours: profile.secondaryInfection.requireWetHours,
        }),
        onDay: (day, state) => pctByDate.set(day.date, goidanichDisplayPct(state, day.date)),
      })
      for (const [date, pct] of pctByDate) patchFor(date).goidanichPct = pct
    } catch {
      failedSections.push('goidanich')
    }
  }

  // 4) Gubler-Thomas, from budbreak (or 1 Jan) or the last powdery spray
  try {
    const latestPowderySprayDate = (
      await db.sprays
        .where('vineyardId')
        .equals(vineyard.id)
        .and((s) => s.target === 'powdery')
        .toArray()
    )
      .map((s) => s.datetime.slice(0, 10))
      .sort()
      .at(-1)
    const gublerStart = resolveGublerStart(phenology.budbreak ?? `${year}-01-01`, latestPowderySprayDate)
    const gublerKeyValue = gublerThomasKey(vineyard.id, year)
    const prepared = await prepareSyncDays(
      vineyard,
      gublerKeyValue,
      gublerStart.resetFromDate,
      elapsedCachedDays,
      syncWindow,
      fetchHistoricalHourly,
      rebuildAll,
    )
    addElapsed(prepared.days)

    const scoreByDate = new Map<string, number | null>()
    await syncDailyAccumulator<GublerThomasState>({
      settingsKey: gublerKeyValue,
      resetFromDate: gublerStart.resetFromDate,
      initialState: gublerStart.initialState,
      days: prepared.days,
      fresh: prepared.fresh,
      fromCheckpoint: prepared.fromCheckpoint,
      checkpointBefore: windowStart,
      step: gublerStep,
      onDay: (day, state) => scoreByDate.set(day.date, state.ignited ? state.score : null),
    })
    for (const [date, score] of scoreByDate) patchFor(date).gublerScore = score
  } catch {
    failedSections.push('gublerThomas')
  }

  // Days after a downy spray and before the next event have no Goidanich value, clear old ones.
  if (latestDownySprayDate) {
    for (const date of elapsedByDate.keys()) {
      if (date > latestDownySprayDate && (!goidanichActiveSince || date < goidanichActiveSince)) {
        patchFor(date).goidanichPct = null
      }
    }
  }

  for (const date of elapsedByDate.keys()) {
    if (secondarySeasonEnded(date, phenology.harvest, profile.secondaryInfection.seasonEndMonthDay)) {
      patchFor(date).goidanichPct = null
    }
  }

  // Weather part of the snapshots: aggregates and source for every elapsed day seen this call.
  for (const day of elapsedByDate.values()) {
    const patch = patchFor(day.date)
    patch.source = day.hours[0]?.source ?? 'forecast'
    patch.meanTempC = dailyMeanTemperature(day.hours)
    patch.precipitationMm = dailyPrecipitation(day.hours)
    patch.meanRhPct = dailyMeanHumidity(day.hours)
  }
  await upsertDailyRisk(vineyard.id, [...snapshotPatches.values()])

  if (legacySource && failedSections.length === 0) {
    await db.settings.where('key').equals(legacyKey).delete()
  }

  const result: SyncSeasonStateResult = { ok: failedSections.length === 0, failedSections, syncedAt }
  await setSetting(lastSyncKey(vineyard.id), result)
  return result
}

interface RunningSync {
  finished: Promise<SyncSeasonStateResult>
  settled: Promise<void>
  nextArgs?: Parameters<typeof runSeasonSync>
  nextResult?: Promise<SyncSeasonStateResult>
}

const runningSyncs = new Map<number, RunningSync>()
const lastSyncedInputs = new Map<number, string>()

/** Everything a sync depends on. Read after a run, so events it recorded itself don't look like a change. */
async function syncInputs(vineyard: Vineyard, phenology: PhenologyDates, cachedHourly: HourlyWeather[]): Promise<string> {
  const vineyardId = vineyard.id!
  const [sprays, events] = await Promise.all([
    db.sprays.where('vineyardId').equals(vineyardId).toArray(),
    db.infectionEvents.where('vineyardId').equals(vineyardId).and(isActiveInfectionEvent).toArray(),
  ])
  return JSON.stringify({
    today: localDateKey(new Date()),
    place: [vineyard.lat, vineyard.lon, vineyard.regionProfile],
    phenology,
    sprays: sprays.map((s) => [s.datetime, s.target]).sort(),
    events: events.map((e) => e.date).sort(),
    cachedHourly,
  })
}

/** Only one sync per plot at a time. Calls in the meantime share one more run afterwards. */
export function syncVineyardSeasonState(
  vineyard: Vineyard,
  phenology: PhenologyDates,
  cachedHourly: HourlyWeather[],
  deps: SyncSeasonStateDeps = {},
): Promise<SyncSeasonStateResult> {
  const vineyardId = vineyard.id
  if (vineyardId === undefined) return runSeasonSync(vineyard, phenology, cachedHourly, deps)

  const running = runningSyncs.get(vineyardId)
  if (running) {
    running.nextArgs = [vineyard, phenology, cachedHourly, deps]
    running.nextResult ??= running.settled.then(() => {
      const [nextVineyard, nextPhenology, nextHourly, nextDeps] = running.nextArgs!
      return syncVineyardSeasonState(nextVineyard, nextPhenology, nextHourly, nextDeps)
    })
    return running.nextResult
  }

  const finished = runSeasonSync(vineyard, phenology, cachedHourly, deps).then(async (result) => {
    if (result.ok) lastSyncedInputs.set(vineyardId, await syncInputs(vineyard, phenology, cachedHourly))
    return result
  })
  const settled = finished.then(
    () => undefined,
    () => undefined,
  ).then(() => {
    runningSyncs.delete(vineyardId)
  })
  runningSyncs.set(vineyardId, { finished, settled })
  return finished
}

/** Skips the sync if nothing changed since the last successful one. */
export async function syncVineyardSeasonStateOnce(
  vineyard: Vineyard,
  phenology: PhenologyDates,
  cachedHourly: HourlyWeather[],
  deps: SyncSeasonStateDeps = {},
): Promise<SyncSeasonStateResult | undefined> {
  if (vineyard.id === undefined) return undefined
  const running = runningSyncs.get(vineyard.id)
  if (running) await running.settled
  if (lastSyncedInputs.get(vineyard.id) === (await syncInputs(vineyard, phenology, cachedHourly))) return undefined
  return syncVineyardSeasonState(vineyard, phenology, cachedHourly, deps)
}
