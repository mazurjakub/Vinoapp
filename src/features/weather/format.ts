/**
 * File: format.ts
 * Created: 2026-10-03
 * Description: Date and time formatting helpers and local date keys.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function localHourKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}`
}

export function formatDay(time: string, locale = 'cs-CZ'): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'numeric' }).format(
    new Date(time),
  )
}

export function formatHour(time: string): string {
  return time.slice(11, 16)
}

export function formatDateTime(iso: string, locale = 'cs-CZ'): string {
  return new Date(iso).toLocaleString(locale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatWeekday(date: string, locale = 'cs-CZ'): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(`${date}T12:00:00`))
}

export function formatDate(date: string, locale = 'cs-CZ'): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`),
  )
}

/** The local calendar day of a stored timestamp, unlike `formatDate`, which takes a YYYY-MM-DD day. */
export function formatTimestampDate(iso: string, locale = 'cs-CZ'): string {
  return formatDate(localDateKey(new Date(iso)), locale)
}

export function formatDateLong(date: string, locale = 'cs-CZ'): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${date}T12:00:00`),
  )
}
