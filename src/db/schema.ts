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
  /** Stored per record, so changing the default unit doesn't change old values. NM and Oe are never converted. */
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

/** Only set for backfilled historical data. */
export type WeatherSource = 'historical-forecast' | 'archive' | 'forecast'

export interface HourlyWeather {
  time: string
  temperature2m: number
  relativeHumidity2m: number
  dewPoint2m: number
  precipitation: number
  source?: WeatherSource
}

/** One row per vineyard and elapsed day. Derived data, rebuilt by the sync. `null` = index not active. */
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
  /** Powdery mildew conditions of the day, independent of the index and of sprays. `null` = too few hours of data. */
  powderyFavorableDay?: boolean | null
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
