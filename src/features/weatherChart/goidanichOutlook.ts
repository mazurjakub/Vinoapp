/**
 * File: goidanichOutlook.ts
 * Created: 2026-11-03
 * Description: Daily Goidanich increments, cold days and the estimated date the index reaches its thresholds.
 */

export interface GoidanichDay {
  date: string
  /** `null` = no value shown that day (no running cycle, or the season is over). */
  pct: number | null
  meanTempC: number | null
}

export interface GoidanichIncrement {
  date: string
  /** What the day added, in percentage points; `null` when it can't be told (no value, or no previous day). */
  incrementPct: number | null
  /** The day added nothing because its mean temperature was below the table's lowest temperature. */
  cold: boolean
}

/**
 * The index never falls within a cycle, so a day's increment is the difference
 * from the day before. A day after a gap, or after a fall (a new cycle), starts
 * from 0. The first day has no previous day, so callers pass one extra leading
 * day and drop it.
 */
export function goidanichIncrements(days: GoidanichDay[], minTempC: number): GoidanichIncrement[] {
  return days.map((day, i) => {
    if (day.pct === null || i === 0) return { date: day.date, incrementPct: null, cold: false }
    const previous = days[i - 1].pct
    const incrementPct = previous === null || day.pct < previous ? day.pct : Math.round((day.pct - previous) * 100) / 100
    const cold = incrementPct === 0 && day.meanTempC !== null && day.meanTempC < minTempC
    return { date: day.date, incrementPct, cold }
  })
}

export type ThresholdStatus =
  | { status: 'reached'; date: string }
  | { status: 'estimated'; date: string }
  | { status: 'notReached' }

export type GoidanichOutlook =
  | { kind: 'none' }
  | { kind: 'seasonOver' }
  | {
      kind: 'cycle'
      alert: ThresholdStatus
      urgent: ThresholdStatus
      /** The index hasn't grown on the last days up to today because it was too cold. */
      cold: boolean
    }

export interface GoidanichOutlookInput {
  /** Days in date order, history and forecast together. */
  days: GoidanichDay[]
  today: string
  /** `alert` is where the warning starts; `urgent` ends the incubation. */
  thresholds: { alert: number; urgent: number }
  isSeasonOver: (date: string) => boolean
  /** The table's lowest temperature: a day below it adds nothing. */
  minTempC: number
}

/** How many of the last days up to today must be cold for the outlook to say so. */
export const COLD_STREAK_DAYS = 2

/** Whether the last `streak` days up to today with a value all added nothing because of the cold. */
export function recentlyCold(increments: GoidanichIncrement[], today: string, streak = COLD_STREAK_DAYS): boolean {
  const recent = increments.filter((d) => d.date <= today && d.incrementPct !== null).slice(-streak)
  return recent.length === streak && recent.every((d) => d.cold)
}

/** First and last index of the cycle the day at `anchor` belongs to. */
function cycleBounds(pcts: (number | null)[], anchor: number): [number, number] {
  let start = anchor
  while (start > 0 && pcts[start - 1] !== null && pcts[start - 1]! <= pcts[start]!) start--
  let end = anchor
  while (end < pcts.length - 1 && pcts[end + 1] !== null && pcts[end + 1]! >= pcts[end]!) end++
  return [start, end]
}

/**
 * When the current cycle reaches the warning and urgent thresholds. A day
 * before today counts as reached; today and later come from the forecast, so
 * they are an estimate. Outside the season nothing is estimated.
 */
export function goidanichOutlook({ days, today, thresholds, isSeasonOver, minTempC }: GoidanichOutlookInput): GoidanichOutlook {
  if (isSeasonOver(today)) return { kind: 'seasonOver' }

  const pcts = days.map((d) => d.pct)
  const todayIndex = days.findIndex((d) => d.date === today)
  if (todayIndex === -1) return { kind: 'none' }

  // The cycle running today, or else the last one before today (it may have just ended).
  let anchor = todayIndex
  while (anchor >= 0 && pcts[anchor] === null) anchor--
  if (anchor === -1) return { kind: 'none' }

  const [start, end] = cycleBounds(pcts, anchor)
  if (end < todayIndex && pcts[end]! < thresholds.urgent) return { kind: 'none' }

  const statusFor = (threshold: number): ThresholdStatus => {
    for (let i = start; i <= end; i++) {
      if (pcts[i]! >= threshold) {
        const date = days[i].date
        return date < today ? { status: 'reached', date } : { status: 'estimated', date }
      }
    }
    return { status: 'notReached' }
  }
  const cycleDays = days.slice(start, end + 1)
  return {
    kind: 'cycle',
    alert: statusFor(thresholds.alert),
    urgent: statusFor(thresholds.urgent),
    cold: recentlyCold(goidanichIncrements(cycleDays, minTempC), today),
  }
}

/** The first date after the season end, where the off-season area starts; `null` if the whole window is in season. */
export function firstOffSeasonDate(dates: string[], isSeasonOver: (date: string) => boolean): string | null {
  return dates.find(isSeasonOver) ?? null
}
