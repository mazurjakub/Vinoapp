/**
 * File: infectionEventsRepo.ts
 * Created: 2026-10-02
 * Description: Stores detected primary infection events and counts them for the season.
 */

import { db } from '../../db'
import type { InfectionEvent } from '../../db/schema'
import type { RiskResult } from '../../rules'

export function isActiveInfectionEvent(event: InfectionEvent): boolean {
  return event.status !== 'revoked'
}

/**
 * Upserts one `infectionEvents` row per newly-detected primary downy mildew
 * day in `results` (deduped by date). Weather cache only holds a rolling
 * ~14-day window, so calling this after every forecast refresh is what lets
 * the season-long event count in Dexie accumulate over time. A revoked event
 * whose day qualifies again becomes active again.
 */
export async function recordPrimaryInfectionEvents(
  vineyardId: number,
  results: RiskResult[],
): Promise<void> {
  const now = new Date().toISOString()
  const highRiskDays = results.filter((r) => r.risk === 'high' && r.rule.startsWith('downy-primary'))

  for (const result of highRiskDays) {
    const existing = await db.infectionEvents
      .where('vineyardId')
      .equals(vineyardId)
      .and((e) => e.date === result.date && e.disease === 'downy' && e.type === 'primary')
      .first()
    if (existing) {
      if (existing.status === 'revoked') {
        await db.infectionEvents.update(existing.id!, {
          status: 'active',
          revokedAt: undefined,
          revokedReason: undefined,
          updatedAt: now,
        })
      }
      continue
    }

    await db.infectionEvents.add({
      vineyardId,
      date: result.date,
      disease: 'downy',
      type: 'primary',
      rule: result.rule,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
  }
}

/**
 * Revokes events the rule itself recorded on days that no longer qualify after
 * their weather was downloaded again. An event entered another way stays active.
 */
export async function revokeUnconfirmedPrimaryEvents(vineyardId: number, results: RiskResult[]): Promise<void> {
  const unconfirmed = new Set(results.filter((r) => r.risk !== 'high' && r.rule.startsWith('downy-primary')).map((r) => r.date))
  const now = new Date().toISOString()
  await db.infectionEvents
    .where('vineyardId')
    .equals(vineyardId)
    .and(
      (e) =>
        isActiveInfectionEvent(e) &&
        unconfirmed.has(e.date) &&
        e.disease === 'downy' &&
        e.type === 'primary' &&
        e.rule.startsWith('downy-primary'),
    )
    .modify({ status: 'revoked', revokedAt: now, revokedReason: 'refinedDataNotMet', updatedAt: now })
}

export async function listRevokedInfectionEvents(vineyardId: number): Promise<InfectionEvent[]> {
  const events = await db.infectionEvents
    .where('vineyardId')
    .equals(vineyardId)
    .and((e) => !isActiveInfectionEvent(e))
    .sortBy('date')
  return events.reverse()
}

export function countSeasonInfectionEvents(
  vineyardId: number,
  year: number,
  disease: 'downy' | 'powdery',
  type: 'primary' | 'secondary',
): Promise<number> {
  const prefix = String(year)
  return db.infectionEvents
    .where('vineyardId')
    .equals(vineyardId)
    .and((e) => isActiveInfectionEvent(e) && e.disease === disease && e.type === type && e.date.startsWith(prefix))
    .count()
}
