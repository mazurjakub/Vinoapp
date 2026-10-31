/**
 * File: schema.ts
 * Created: 2026-10-03
 * Description: TypeScript types for all database records.
 */

export type GrowthStageType = 'budbreak' | 'shoot10cm' | 'flowering' | 'veraison' | 'ripening' | 'harvest'
export type SprayTarget = 'downy' | 'powdery' | 'botrytis' | 'other'
export type WorkType = 'pruning' | 'green_work' | 'fertilizing' | 'other'

export type RegionProfileId = 'cz-morava' | 'eu-generic'

export type Susceptibility = 'low' | 'medium' | 'high'

export interface Variety {
  id?: number
  name: string
  isPiwi: boolean
  susceptibility: {
    downy: Susceptibility
    powdery: Susceptibility
    botrytis: Susceptibility
  }
  /** Offset in days vs. a reference variety, applied to growth-stage estimates. */
  stageOffsetDays: number
  createdAt: string
  updatedAt: string
}

export interface Vineyard {
  id?: number
  name: string
  lat: number
  lon: number
  regionProfile: RegionProfileId
  varietyId: number
  plantedYear: number
  area?: number
  vineHeadCount?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface GrowthStage {
  id?: number
  vineyardId: number
  year: number
  stage: GrowthStageType
  date: string
  createdAt: string
  updatedAt: string
}

export interface Spray {
  id?: number
  vineyardId: number
  datetime: string
  product: string
  activeSubstance: string
  dose: string
  target: SprayTarget
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Work {
  id?: number
  vineyardId: number
  datetime: string
  type: WorkType
  notes?: string
  photoBlob?: Blob
  createdAt: string
  updatedAt: string
}

export type SugarUnit = 'NM' | 'Oe'

export interface Harvest {
  id?: number
  vineyardId: number
  year: number
  date: string
  weightKg: number
  sugar?: number
  /** Unit the `sugar` value was recorded in — stored per-record (not read from
   * the app-wide setting) so changing the default unit later never silently
   * reinterprets old numbers. Values are never converted between NM and Oe,
   * because there's no verified formula for it. */
  sugarUnit?: SugarUnit
  notes?: string
  createdAt: string
  updatedAt: string
}

export type InfectionDisease = 'downy' | 'powdery'
export type InfectionEventType = 'primary' | 'secondary'

export type InfectionEventStatus = 'active' | 'revoked'
export type InfectionEventRevokedReason = 'refinedDataNotMet'

export interface InfectionEvent {
  id?: number
  vineyardId: number
  date: string
  disease: InfectionDisease
  type: InfectionEventType
  rule: string
  note?: string
  /** A revoked event stays visible in the journal, but counts for nothing. */
  status: InfectionEventStatus
  revokedAt?: string
  revokedReason?: InfectionEventRevokedReason
  createdAt: string
  updatedAt: string
}

/** Which Open-Meteo endpoint served this hour — only set for backfilled
 * historical data (see `weather/openMeteoProvider.ts`); absent for the
 * regular rolling display cache, which always comes from the forecast
 * endpoint regardless of age. */
export type WeatherSource = 'historical-forecast' | 'archive' | 'forecast'

export interface HourlyWeather {
  time: string
  temperature2m: number
  relativeHumidity2m: number
  dewPoint2m: number
  precipitation: number
  source?: WeatherSource
}

/**
 * One row per vineyard per elapsed day: the weather aggregates and the
 * engine's stored index values for that day. Derived data — not exported,
 * rebuilt by `syncVineyardSeasonState`. `null` index = not active yet.
 */
export interface DailyRisk {
  id?: number
  vineyardId: number
  date: string
  source: WeatherSource
  meanTempC?: number
  precipitationMm?: number
  meanRhPct?: number
  goidanichPct?: number | null
  gublerScore?: number | null
}

export interface WeatherCache {
  id?: number
  vineyardId: number
  fetchedAt: string
  hourly: HourlyWeather[]
}

export interface Setting {
  id?: number
  key: string
  value: unknown
}
