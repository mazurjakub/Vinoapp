/**
 * File: weatherProvider.ts
 * Created: 2026-10-02
 * Description: Interface that every weather data provider implements.
 */

import type { HourlyWeather } from '../db/schema'

export interface WeatherProvider {
  id: string
  fetchHourly(lat: number, lon: number): Promise<HourlyWeather[]>
  /** Fetches a specific historical date range (both dates inclusive, YYYY-MM-DD). */
  fetchHourlyRange(lat: number, lon: number, startDate: string, endDate: string): Promise<HourlyWeather[]>
}
