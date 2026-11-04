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

/** Prepends a fetched historical range to `cachedDays` if `neededFrom` predates what's already cached. */
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
 * Resolves which days an accumulator should fold this call.
 *
 * Window path: the state reaches into the recomputed days, so continue from the
 * checkpoint before them with the fresh download. Days that left the window
 * since the last sync are fetched too, because they were never made final.
 *
 * Normal path: resume from `lastProcessedDate + 1` and fetch any gap. Also used
 * offline, where finished days just stay as they are.
 *
 * Rebuild path: recompute from `resetFromDate` with fresh data. Also for a state
 * stored before checkpoints existed. The stored state is NOT deleted here. The
 * fetch happens first; if it fails the old state stays, and the caller overwrites
 * it only after the recomputation finishes (`fresh: true`).
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
 * Keeps the season-long, cumulative parts of the rule engine (SET8,0 degree
 * sum, the Goidanich secondary index, and the Gubler-Thomas index) correct
 * even though the weather cache itself only ever holds a short rolling
 * window. Safe to call repeatedly: only the last `RECOMPUTED_DAYS` are folded
 * again, from a fresh download and from the state before them, and older days
 * stay as they are (see `syncDailyAccumulator`).
 *
 * Only *elapsed* days (strictly before today) are folded into the persisted
 * state. Today and the forecast are computed in memory for display only
 * (see `riskProjection.ts`) and never stored as state.
 *
 * Each section is independent: if a historical-fetch network call fails, that
 * section's persisted state stays exactly as it was, and the others still
 * sync. Failures are listed in `failedSections` and surfaced through
 * `lastSeasonSync:{vineyardId}`.
 *
 * Per-day snapshots (`dailyRisk`) are written next to the accumulators. They
 * hold each elapsed day's weather aggregates, its source
 * and the Goidanich / Gubler-Thomas values the engine stored for that day.
 * Snapshots are written only after a section finishes successfully. A forced
 * recompute overwrites the affected days, and a day that isn't active yet keeps
 * `null` instead of 0.
 *
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
  // Snapshot patches collected from sections that finished successfully.
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
  // A missing snapshot history (first run after the dailyRisk table was added,
  // or after an import) forces a replay too, so the chart has the past days.
  const rebuildAll = legacySource || (await db.dailyRisk.where('vineyardId').equals(vineyard.id).count()) === 0

  // 1) SET8,0 oospore degree-day sum. No snapshot columns; it only feeds the primary-infection events.
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
      // The primary-event check needs the degree-sum as of the day before the first day folded
      // now. After a fresh recompute that's the season start (0), not the stored season total,
      // otherwise the sum is counted twice.
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

      // 2) Detect + durably record new primary-infection events among the newly folded days.
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

  // 3) Goidanich secondary index, active from the earliest primary event this
  // season that isn't superseded by a later downy-targeted spray. Logging such
  // a spray deactivates the index until a
  // NEW primary event dated after that spray — a changed `resetFromDate` then
  // restarts the accumulator from that new event, not from the spray date.
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

  // 4) Gubler-Thomas powdery mildew index, anchored at budbreak (or Jan 1st if
  // budbreak isn't recorded), or at the latest powdery spray after that.
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

  // Goidanich is inactive for any elapsed day after the latest downy spray
  // and before `goidanichActiveSince` (or indefinitely, if there's no eligible
  // event yet) — null those snapshot days explicitly, since they may still
  // hold a non-null value written before the spray reset the index.
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

/**
 * Runs the sync with a per-plot lock. While one runs, another call doesn't start
 * alongside it: all calls in the meantime share one further run after it finishes,
 * with the latest arguments.
 */
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

/**
 * For a caller that reacts to data changing, such as opening the Overview: does
 * nothing if the last successful sync already saw the same data, so a weather
 * refresh isn't followed by a second run. Returns `undefined` when skipped.
 */
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
