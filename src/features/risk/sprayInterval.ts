/**
 * File: sprayInterval.ts
 * Created: 2026-11-04
 * Description: Warning when the protection from the last spray has probably run out during the season.
 */

import { db } from '../../db'
import type { DailyRisk } from '../../db/schema'
import {
  addDaysUTC,
  daysBetween,
  GUBLER_THOMAS,
  secondarySeasonEnded,
  type RiskReason,
  type RiskResult,
} from '../../rules'
import { isActiveInfectionEvent } from './infectionEventsRepo'

export type SprayIntervalDisease = 'downy' | 'powdery'

export interface SprayIntervalAnchors {
  lastSprayDate?: string
  /** First active infection event, for powdery mildew the end of the first run of 3 favourable days. */
  firstInfectionDate?: string
}

export interface SprayIntervalInput extends SprayIntervalAnchors {
  today: string
  warningDays: number
  harvestDate?: string
  seasonEndMonthDay: string
  highRiskAhead: boolean
}

export interface SprayIntervalWarning {
  urgent: boolean
  reasons: RiskReason[]
}

export async function getSprayIntervalAnchors(
  vineyardId: number,
  year: number,
  disease: SprayIntervalDisease,
  budbreak?: string,
): Promise<SprayIntervalAnchors> {
  const prefix = String(year)
  const sprays = await db.sprays
    .where('vineyardId')
    .equals(vineyardId)
    .and((s) => s.target === disease && s.datetime.startsWith(prefix))
    .sortBy('datetime')
  const lastSprayDate = sprays.at(-1)?.datetime.slice(0, 10)

  if (disease === 'downy') {
    const events = await db.infectionEvents
      .where('vineyardId')
      .equals(vineyardId)
      .and((e) => isActiveInfectionEvent(e) && e.disease === 'downy' && e.date.startsWith(prefix))
      .sortBy('date')
    return { lastSprayDate, firstInfectionDate: events[0]?.date }
  }

  // Without a budbreak date warm days in April would start the countdown before there are any leaves.
  if (!budbreak) return { lastSprayDate }
  const rows = await db.dailyRisk
    .where('[vineyardId+date]')
    .between([vineyardId, budbreak], [vineyardId, `${prefix}-12-31`], true, true)
    .toArray()
  return { lastSprayDate, firstInfectionDate: firstFavorableRunEnd(rows) }
}

/** The natural Gubler-Thomas ignition: consecutive calendar days, a day without data breaks the run. */
function firstFavorableRunEnd(rows: DailyRisk[]): string | undefined {
  let run = 0
  let previous: string | undefined
  for (const row of rows) {
    const continues = previous !== undefined && row.date === addDaysUTC(previous, 1)
    run = row.powderyFavorableDay === true ? (continues ? run + 1 : 1) : 0
    previous = row.date
    if (run >= GUBLER_THOMAS.IGNITION_CONSECUTIVE_DAYS) return row.date
  }
  return undefined
}

export function hasHighRiskAhead(results: RiskResult[], today: string, days = 7): boolean {
  const last = addDaysUTC(today, days - 1)
  return results.some((r) => r.risk === 'high' && r.date >= today && r.date <= last)
}

/** Counted from the last spray in the season, or from the first infection when there is no spray yet. */
export function sprayIntervalWarning(input: SprayIntervalInput): SprayIntervalWarning | null {
  const { firstInfectionDate, lastSprayDate, today, warningDays } = input
  if (!firstInfectionDate) return null
  if (secondarySeasonEnded(today, input.harvestDate, input.seasonEndMonthDay)) return null

  const since = lastSprayDate ?? firstInfectionDate
  const days = daysBetween(since, today)
  if (days < warningDays) return null

  const reasons: RiskReason[] = [
    {
      key: lastSprayDate ? 'risk.sprayInterval.sinceSpray' : 'risk.sprayInterval.sinceInfection',
      params: { days, limit: warningDays },
      dates: { date: since },
    },
  ]
  if (input.highRiskAhead) reasons.push({ key: 'risk.sprayInterval.highRiskAhead' })
  return { urgent: input.highRiskAhead, reasons }
}
