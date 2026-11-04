/**
 * File: downyMildewPrimary.ts
 * Created: 2026-10-02
 * Description: Primary downy mildew risk rule, driven by the regional profile.
 */

import type { HourlyWeather } from '../db/schema'
import { incubationDays } from './incubation'
import type { RegionProfile } from './regionProfiles'
import type { PhenologyDates, Risk, RiskReason, RiskResult } from './types'
import { dailyMaxTemperature, dailyMeanTemperature, dailyMinTemperature, dailyPrecipitation, groupByDay } from './weatherMath'

/**
 * cz-morava: mean/min temperature and oospore maturity (SET8,0), shoot length is ignored.
 * eu-generic: the 3-10 rule (shoot 10 cm, max temperature 10 °C, 10 mm of rain).
 * Rain is summed per calendar day, not over 24-48 h.
 *
 * `priorDegreeSum` is the stored degree sum before the first day in `hourly`. Without it
 * the sum is counted from budbreak using only `hourly`.
 */
export function downyMildewPrimaryRisk(
  hourly: HourlyWeather[],
  phenology: PhenologyDates,
  profile: RegionProfile,
  priorDegreeSum?: number,
): RiskResult[] {
  const { primaryInfection: p } = profile
  let runningDegreeSum = priorDegreeSum ?? 0

  return groupByDay(hourly).map((day) => {
    const reasons: RiskReason[] = []
    let risk: Risk = 'low'

    const precipitation = dailyPrecipitation(day.hours)
    const precipitationOk = precipitation >= p.minPrecipitation24hMm

    let temperatureOk: boolean
    const meanTemp = dailyMeanTemperature(day.hours)
    if (p.minMeanTemperatureC !== undefined || p.minMinimumTemperatureC !== undefined) {
      const minTemp = dailyMinTemperature(day.hours)
      const meanOk = p.minMeanTemperatureC === undefined || meanTemp >= p.minMeanTemperatureC
      const minOk = p.minMinimumTemperatureC === undefined || minTemp >= p.minMinimumTemperatureC
      temperatureOk = meanOk && minOk
    } else {
      const maxTemp = dailyMaxTemperature(day.hours)
      temperatureOk = p.minMaxTemperatureC === undefined || maxTemp >= p.minMaxTemperatureC
    }

    const shootLongEnough =
      !p.requiresShootLengthDate ||
      (phenology.shoot10cm !== undefined && day.date >= phenology.shoot10cm)

    let oosporesReady = true
    let degreeSum = 0
    if (p.requiresOosporeMaturity) {
      // priorDegreeSum mode: every day in `hourly` is new, always accumulate.
      // budbreak-only fallback mode: only start accumulating once we reach it.
      const pastStart = priorDegreeSum !== undefined || (phenology.budbreak !== undefined && day.date >= phenology.budbreak)
      if (pastStart) {
        runningDegreeSum += Math.max(0, meanTemp - p.oosporeDegreeSumBaseC)
        degreeSum = runningDegreeSum
        oosporesReady = degreeSum >= p.oosporeDegreeSumThresholdDs
      } else {
        oosporesReady = false
      }
    }

    if (temperatureOk && precipitationOk && shootLongEnough && oosporesReady) {
      risk = 'high'

      const conditions: RiskReason[] = []
      if (p.minMeanTemperatureC !== undefined) {
        conditions.push({
          key: 'riskReasons.meanTemperature',
          params: { value: meanTemp.toFixed(1), min: p.minMeanTemperatureC },
        })
      }
      if (p.minMinimumTemperatureC !== undefined) {
        conditions.push({ key: 'riskReasons.minimumTemperature', params: { min: p.minMinimumTemperatureC } })
      }
      if (p.minMaxTemperatureC !== undefined) {
        conditions.push({ key: 'riskReasons.temperature', params: { min: p.minMaxTemperatureC } })
      }
      conditions.push({
        key: 'riskReasons.precipitation',
        params: { value: precipitation.toFixed(1), min: p.minPrecipitation24hMm },
      })
      if (p.requiresShootLengthDate) {
        conditions.push({ key: 'riskReasons.shootLength' })
      }
      if (p.requiresOosporeMaturity) {
        conditions.push({
          key: 'riskReasons.oosporesMature',
          params: { value: degreeSum.toFixed(0), min: p.oosporeDegreeSumThresholdDs },
        })
      }
      reasons.push({ key: 'riskReasons.primaryMet', params: { profile: profile.id }, conditions })

      if (p.tracksInfectionEvents) {
        reasons.push({
          key: 'riskReasons.leafCheck',
          params: { days: Math.round(incubationDays(meanTemp)), temperature: meanTemp.toFixed(1) },
        })
      }
    } else {
      reasons.push({ key: 'riskReasons.primaryNotMet' })
    }

    return { date: day.date, risk, reasons, rule: `downy-primary-${profile.id}`, source: profile.source }
  })
}

export function countPrimaryInfectionEvents(results: RiskResult[]): number {
  return results.filter((r) => r.risk === 'high' && r.rule.startsWith('downy-primary')).length
}
