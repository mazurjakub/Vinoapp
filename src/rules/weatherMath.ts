/**
 * File: weatherMath.ts
 * Created: 2026-10-02
 * Description: Weather calculations: grouping by day, daily statistics, degree days and leaf wetness estimates.
 */

import type { HourlyWeather } from '../db/schema'

export interface DayHours {
  date: string // YYYY-MM-DD
  hours: HourlyWeather[]
}

export function groupByDay(hourly: HourlyWeather[]): DayHours[] {
  const byDate = new Map<string, HourlyWeather[]>()
  for (const hour of hourly) {
    const date = hour.time.slice(0, 10)
    const bucket = byDate.get(date)
    if (bucket) {
      bucket.push(hour)
    } else {
      byDate.set(date, [hour])
    }
  }
  return Array.from(byDate.entries())
    .map(([date, hours]) => ({ date, hours }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function dailyMaxTemperature(hours: HourlyWeather[]): number {
  return Math.max(...hours.map((h) => h.temperature2m))
}

export function dailyMeanTemperature(hours: HourlyWeather[]): number {
  return hours.reduce((sum, h) => sum + h.temperature2m, 0) / hours.length
}

export function dailyMeanHumidity(hours: HourlyWeather[]): number {
  return hours.reduce((sum, h) => sum + h.relativeHumidity2m, 0) / hours.length
}

export function dailyMinTemperature(hours: HourlyWeather[]): number {
  return Math.min(...hours.map((h) => h.temperature2m))
}

export function dailyPrecipitation(hours: HourlyWeather[]): number {
  return hours.reduce((sum, h) => sum + h.precipitation, 0)
}

/**
 * Only an estimate, because Open-Meteo has no leaf wetness measurement. An hour
 * counts as wet when humidity is high or the temperature is close to the dew point.
 */
export function estimateLeafWetnessHours(
  hours: HourlyWeather[],
  minRelativeHumidityPct: number,
  maxDewPointDeltaC: number,
): number {
  return hours.filter(
    (h) =>
      h.relativeHumidity2m >= minRelativeHumidityPct ||
      h.temperature2m - h.dewPoint2m <= maxDewPointDeltaC,
  ).length
}

export function longestConsecutiveRun(hours: HourlyWeather[], inRange: (h: HourlyWeather) => boolean): number {
  let longest = 0
  let current = 0
  for (const hour of hours) {
    if (inRange(hour)) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }
  return longest
}

function parseDateUTC(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((parseDateUTC(toDate) - parseDateUTC(fromDate)) / (24 * 60 * 60 * 1000))
}

/** Adds (or subtracts, with a negative count) whole days to a YYYY-MM-DD date string. */
export function addDaysUTC(date: string, count: number): string {
  const ms = parseDateUTC(date) + count * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

export function hasConsecutiveWetHours(
  hours: HourlyWeather[],
  minRelativeHumidityPct: number,
  consecutiveHours: number,
): boolean {
  return longestConsecutiveRun(hours, (h) => h.relativeHumidity2m > minRelativeHumidityPct) >= consecutiveHours
}

/** Degree-days above the base, from daily mean temperatures; both dates are inclusive. */
export function degreeDaySum(hourly: HourlyWeather[], fromDate: string, toDate: string, baseC: number): number {
  const days = groupByDay(hourly).filter((d) => d.date >= fromDate && d.date <= toDate)
  return days.reduce((sum, day) => sum + Math.max(0, dailyMeanTemperature(day.hours) - baseC), 0)
}
