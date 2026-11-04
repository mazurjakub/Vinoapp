/**
 * File: regionProfiles.ts
 * Created: 2026-10-03
 * Description: Regional profiles with the rule thresholds and their sources.
 */

import type { RegionProfileId } from '../db/schema'

export interface PrimaryInfectionProfile {
  /** The Moravian reports don't list shoot length as a condition, so only eu-generic requires it. */
  requiresShootLengthDate: boolean
  minMeanTemperatureC?: number
  minMinimumTemperatureC?: number
  /** The 3-10 model's "above 10 °C", read as the daily maximum. */
  minMaxTemperatureC?: number
  minPrecipitation24hMm: number
  requiresOosporeMaturity: boolean
  oosporeDegreeSumBaseC: number
  oosporeDegreeSumThresholdDs: number
  tracksInfectionEvents: boolean
}

export interface PowderyMildewProfile {
  /**
   * Only 'original' (35 °C / 0.25 h, -10, no delay) is implemented. The
   * multi-day variants from Peduto et al. (2013, Table 1) can be added here later.
   */
  hotDayVariant: 'original'
}

export interface SecondaryInfectionProfile {
  /** Default without a source: a cycle ends after this many days in a row without progress. */
  stallDays: number
  /** Default without a source: MM-DD after which secondary infection is hidden if no harvest is recorded. */
  seasonEndMonthDay: string
  /**
   * Humidity above 60% in two hours in a row before a day counts. Off by default:
   * it comes from an ambiguous diagram and isn't verified.
   */
  requireWetHours: boolean
  /** Goidanich thresholds in %. The engine, the chart, its sentence, the Overview and the alerts all read these. */
  thresholdsPct: GoidanichThresholds
  /** Where the thresholds come from. */
  thresholdsSource: string
  /** When the thresholds were last checked against the source (YYYY-MM-DD); `null` = not checked yet. */
  thresholdsVerifiedOn: string | null
}

export interface GoidanichThresholds {
  /** Warning: the cycle is near its end. */
  warning: number
  /** End of incubation: the cycle closes. */
  urgent: number
}

/**
 * Default values of the profiles. The paper also names a more cautious 80%
 * warning; it isn't used.
 */
export const DEFAULT_GOIDANICH_THRESHOLDS: GoidanichThresholds = { warning: 90, urgent: 100 }
const GOIDANICH_THRESHOLDS_SOURCE = 'Pérez-Expósito et al. (2017), VineSens, Sensors 17(3), 465: alerts at 90% (default) and 100%.'

export interface RegionProfile {
  id: RegionProfileId
  primaryInfection: PrimaryInfectionProfile
  secondaryInfection: SecondaryInfectionProfile
  powderyMildew: PowderyMildewProfile
  source: string
  verified: 'verified-partial' | 'generic'
}

export const REGION_PROFILES: Record<RegionProfileId, RegionProfile> = {
  'cz-morava': {
    id: 'cz-morava',
    primaryInfection: {
      requiresShootLengthDate: false,
      minMeanTemperatureC: 13,
      minMinimumTemperatureC: 8,
      minPrecipitation24hMm: 10,
      requiresOosporeMaturity: true,
      oosporeDegreeSumBaseC: 8.0,
      oosporeDegreeSumThresholdDs: 170,
      tracksInfectionEvents: true,
    },
    secondaryInfection: {
      stallDays: 21,
      seasonEndMonthDay: '10-31',
      requireWetHours: false,
      thresholdsPct: DEFAULT_GOIDANICH_THRESHOLDS,
      thresholdsSource: GOIDANICH_THRESHOLDS_SOURCE,
      thresholdsVerifiedOn: '2026-11-04',
    },
    powderyMildew: { hotDayVariant: 'original' },
    // TODO: confirm the exact start date of the SET8,0 sum.
    source: 'Situation reports for the Moravian wine region (2009, 2012, 2025).',
    verified: 'verified-partial',
  },
  'eu-generic': {
    id: 'eu-generic',
    primaryInfection: {
      requiresShootLengthDate: true,
      minMaxTemperatureC: 10,
      minPrecipitation24hMm: 10,
      requiresOosporeMaturity: false,
      oosporeDegreeSumBaseC: 8.0,
      oosporeDegreeSumThresholdDs: 170,
      tracksInfectionEvents: false,
    },
    secondaryInfection: {
      stallDays: 21,
      seasonEndMonthDay: '10-31',
      requireWetHours: false,
      thresholdsPct: DEFAULT_GOIDANICH_THRESHOLDS,
      thresholdsSource: GOIDANICH_THRESHOLDS_SOURCE,
      thresholdsVerifiedOn: '2026-11-04',
    },
    powderyMildew: { hotDayVariant: 'original' },
    source: 'IWC Insight (2019), 3-10 model. Unverified for any specific region.',
    verified: 'generic',
  },
}
