/**
 * File: sprayInterval.ts
 * Created: 2026-11-04
 * Description: Warning when the protection from the last spray has probably run out during the season.
 */

import { db } from '../../db'
import { addDaysUTC, daysBetween, secondarySeasonEnded, type RiskReason, type RiskResult } from '../../rules'
import { isActiveInfectionEvent } from './infectionEventsRepo'

export type SprayIntervalDisease = 'downy' | 'powdery'

export interface SprayIntervalAnchors {
  lastSprayDate?: string
  /** First active infection event, for powdery mildew the natural Gubler-Thomas ignition. */
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

  // A spray leaves the index started, so only an ignition on or before the first spray is natural.
  const ignited = await db.dailyRisk
    .where('[vineyardId+date]')
    .between([vineyardId, `${prefix}-01-01`], [vineyardId, `${prefix}-12-31`], true, true)
    .and((row) => row.gublerScore !== null && row.gublerScore !== undefined)
    .first()
  const firstSprayDate = sprays[0]?.datetime.slice(0, 10)
  const natural = ignited && (!firstSprayDate || ignited.date <= firstSprayDate)
  return { lastSprayDate, firstInfectionDate: natural ? ignited.date : undefined }
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
