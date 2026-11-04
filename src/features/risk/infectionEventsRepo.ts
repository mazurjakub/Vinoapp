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

/** Saves one event per new high-risk primary day. A revoked event that qualifies again becomes active. */
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

/** Revokes events recorded by the rule on days that no longer qualify after a new download. Manual ones stay. */
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
