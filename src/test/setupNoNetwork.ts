/**
 * File: setupNoNetwork.ts
 * Created: 2026-10-31
 * Description: Replaces the network in tests with fixed weather, so no test depends on a live API.
 */

const HOURS = Array.from({ length: 24 }, (_, hour) => `T${String(hour).padStart(2, '0')}:00`)

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
}

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(input instanceof Request ? input.url : input)
  const end = url.searchParams.get('end_date')
  const time: string[] = []
  for (let date = url.searchParams.get('start_date'); date && end && date <= end; date = nextDay(date)) {
    time.push(...HOURS.map((hour) => date + hour))
  }
  const hourly = {
    time,
    temperature_2m: time.map(() => 10),
    relative_humidity_2m: time.map(() => 60),
    dew_point_2m: time.map(() => 3),
    precipitation: time.map(() => 0),
  }
  return new Response(JSON.stringify({ hourly }), { status: 200 })
}) as typeof fetch
