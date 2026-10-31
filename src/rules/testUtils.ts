/**
 * File: testUtils.ts
 * Created: 2026-10-02
 * Description: Helpers that create synthetic hourly weather for rule tests.
 */

import type { HourlyWeather } from '../db/schema'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function makeHour(date: string, hour: number, overrides: Partial<HourlyWeather> = {}): HourlyWeather {
  return {
    time: `${date}T${pad(hour)}:00`,
    temperature2m: 10,
    relativeHumidity2m: 50,
    dewPoint2m: 0,
    precipitation: 0,
    ...overrides,
  }
}

/** Builds 24 hourly entries for `date`, applying `overrides` per hour index (0–23). */
export function makeDay(date: string, overrides: (hour: number) => Partial<HourlyWeather> = () => ({})): HourlyWeather[] {
  return Array.from({ length: 24 }, (_, hour) => makeHour(date, hour, overrides(hour)))
}
