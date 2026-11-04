/**
 * File: goidanichStateMachine.ts
 * Created: 2026-10-02
 * Description: Adds one day of Goidanich development to the accumulated value and resolves its alert level.
 */

import { GOIDANICH_TABLE_MIN_TEMP_C, goidanichDailyDevelopment } from './goidanichDailyDevelopment'
import type { GoidanichThresholds } from './regionProfiles'
import type { RiskReason } from './types'

export type GoidanichAlertLevel = 'none' | 'warning' | 'urgent'

export interface GoidanichState {
  accumulatedPct: number
  alertLevel: GoidanichAlertLevel
}

export function initialGoidanichState(): GoidanichState {
  return { accumulatedPct: 0, alertLevel: 'none' }
}

/** Call when a spray is logged: the paper has the user manually restart the alert. */
export function resetGoidanichState(): GoidanichState {
  return initialGoidanichState()
}

export interface GoidanichDayInput {
  meanTempC: number
  /** Only selects the table column (below or from 75%); it doesn't decide whether a day counts. */
  rhPct: number
  wetTwoConsecutiveHours: boolean
  requireWetHours?: boolean
  /** Too few hours for a reliable daily mean, so the day adds nothing. */
  incompleteDay?: boolean
  /** From the plot's region profile. */
  thresholds: GoidanichThresholds
}

export interface GoidanichStepResult {
  state: GoidanichState
  developmentAddedPct: number
  triggeredAlert: GoidanichAlertLevel | null
  reason: RiskReason
}

const ALERT_ORDER: GoidanichAlertLevel[] = ['none', 'warning', 'urgent']

function resolveAlert(
  currentLevel: GoidanichAlertLevel,
  accumulatedPct: number,
  thresholds: GoidanichThresholds,
): { alertLevel: GoidanichAlertLevel; triggeredAlert: GoidanichAlertLevel | null } {
  let nextLevel: GoidanichAlertLevel = currentLevel
  if (accumulatedPct >= thresholds.urgent) nextLevel = 'urgent'
  else if (accumulatedPct >= thresholds.warning) nextLevel = 'warning'

  const triggeredAlert =
    ALERT_ORDER.indexOf(nextLevel) > ALERT_ORDER.indexOf(currentLevel) ? nextLevel : null
  return { alertLevel: nextLevel, triggeredAlert }
}

function noChange(state: GoidanichState, reason: RiskReason): GoidanichStepResult {
  return { state, developmentAddedPct: 0, triggeredAlert: null, reason }
}

export function advanceGoidanichState(state: GoidanichState, input: GoidanichDayInput): GoidanichStepResult {
  if (input.incompleteDay) return noChange(state, { key: 'riskReasons.goidanichIncompleteDay' })
  // The table has a row for 12 °C, so only a mean below it adds nothing.
  if (input.meanTempC < GOIDANICH_TABLE_MIN_TEMP_C) {
    return noChange(state, {
      key: 'riskReasons.goidanichTooCold',
      params: { temperature: input.meanTempC.toFixed(1), min: GOIDANICH_TABLE_MIN_TEMP_C },
    })
  }
  if (input.requireWetHours && !input.wetTwoConsecutiveHours) {
    return noChange(state, { key: 'riskReasons.goidanichNoWetHours' })
  }

  const developmentAddedPct = goidanichDailyDevelopment(input.meanTempC, input.rhPct, state.accumulatedPct)
  // Table values have two decimals. Summing them as floats could leave 95 + 5 just under a threshold.
  const accumulatedPct = Math.round((state.accumulatedPct + developmentAddedPct) * 100) / 100
  const { alertLevel, triggeredAlert } = resolveAlert(state.alertLevel, accumulatedPct, input.thresholds)
  return {
    state: { accumulatedPct, alertLevel },
    developmentAddedPct,
    triggeredAlert,
    reason: {
      key: 'riskReasons.goidanichDevelopment',
      params: { added: developmentAddedPct.toFixed(1), total: accumulatedPct.toFixed(1) },
    },
  }
}
