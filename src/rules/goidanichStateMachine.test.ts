/**
 * File: goidanichStateMachine.test.ts
 * Created: 2026-10-02
 * Description: Tests the daily Goidanich increase and its warning thresholds.
 */

import { describe, expect, it } from 'vitest'
import {
  advanceGoidanichState,
  initialGoidanichState,
  resetGoidanichState,
  type GoidanichState,
} from './goidanichStateMachine'
import { DEFAULT_GOIDANICH_THRESHOLDS } from './regionProfiles'

const WARNING_THRESHOLD_PCT = DEFAULT_GOIDANICH_THRESHOLDS.warning
const URGENT_THRESHOLD_PCT = DEFAULT_GOIDANICH_THRESHOLDS.urgent

const baseInput = { meanTempC: 20, rhPct: 90, wetTwoConsecutiveHours: false, thresholds: DEFAULT_GOIDANICH_THRESHOLDS }

describe('advanceGoidanichState', () => {
  it('adds development on a day above 12 °C, without any rain or hourly humidity input', () => {
    const result = advanceGoidanichState(initialGoidanichState(), baseInput)
    expect(result.developmentAddedPct).toBeGreaterThan(0)
    expect(result.state.accumulatedPct).toBe(result.developmentAddedPct)
  })

  it('names the mean temperature as the reason below 12 °C', () => {
    const result = advanceGoidanichState(initialGoidanichState(), { ...baseInput, meanTempC: 11.9 })
    expect(result.developmentAddedPct).toBe(0)
    expect(result.reason).toEqual({
      key: 'riskReasons.goidanichTooCold',
      params: { temperature: '11.9', min: 12 },
    })
  })

  it('uses the table row for exactly 12.0 °C instead of treating it as cold', () => {
    // Row 12, stage 0, humidity from 75%: 5.25.
    const result = advanceGoidanichState(initialGoidanichState(), { ...baseInput, meanTempC: 12 })
    expect(result.developmentAddedPct).toBe(5.25)
    expect(result.reason.key).toBe('riskReasons.goidanichDevelopment')
  })

  it('reaches the alert levels at the profile thresholds it is given', () => {
    const thresholds = { warning: 50, urgent: 60 }
    const result = advanceGoidanichState({ accumulatedPct: 45, alertLevel: 'none' }, { ...baseInput, thresholds })
    expect(result.state.accumulatedPct).toBeGreaterThanOrEqual(50)
    expect(result.triggeredAlert).not.toBeNull()
  })

  it('uses humidity only to select the table column', () => {
    const dry = advanceGoidanichState(initialGoidanichState(), { ...baseInput, rhPct: 40 })
    const humid = advanceGoidanichState(initialGoidanichState(), { ...baseInput, rhPct: 80 })
    expect(dry.developmentAddedPct).toBeGreaterThan(0)
    expect(humid.developmentAddedPct).toBeGreaterThan(dry.developmentAddedPct)
  })

  it('applies the two-hour humidity condition only when the profile requires it', () => {
    const result = advanceGoidanichState(initialGoidanichState(), { ...baseInput, requireWetHours: true })
    expect(result.developmentAddedPct).toBe(0)
    expect(result.reason.key).toBe('riskReasons.goidanichNoWetHours')

    const wet = advanceGoidanichState(initialGoidanichState(), {
      ...baseInput,
      requireWetHours: true,
      wetTwoConsecutiveHours: true,
    })
    expect(wet.developmentAddedPct).toBeGreaterThan(0)
  })
})

describe('advanceGoidanichState - alert thresholds', () => {
  const smallStepInput = { ...baseInput, meanTempC: 13, rhPct: 50 }

  it('raises a warning the step the accumulated total first reaches 90% (but not 100%)', () => {
    const justBelow: GoidanichState = { accumulatedPct: WARNING_THRESHOLD_PCT - 1, alertLevel: 'none' }
    const crossing = advanceGoidanichState(justBelow, smallStepInput)
    expect(crossing.state.accumulatedPct).toBeGreaterThanOrEqual(WARNING_THRESHOLD_PCT)
    expect(crossing.state.accumulatedPct).toBeLessThan(URGENT_THRESHOLD_PCT)
    expect(crossing.triggeredAlert).toBe('warning')
  })

  it('does not re-trigger an alert when a later day adds nothing', () => {
    const alreadyWarning: GoidanichState = { accumulatedPct: 95, alertLevel: 'warning' }
    const noGain = advanceGoidanichState(alreadyWarning, { ...smallStepInput, meanTempC: 5 })
    expect(noGain.developmentAddedPct).toBe(0)
    expect(noGain.state).toEqual(alreadyWarning)
    expect(noGain.triggeredAlert).toBeNull()
  })

  it('raises an urgent alert once the total reaches 100%', () => {
    const justBelowUrgent: GoidanichState = { accumulatedPct: URGENT_THRESHOLD_PCT - 0.5, alertLevel: 'warning' }
    expect(advanceGoidanichState(justBelowUrgent, smallStepInput).triggeredAlert).toBe('urgent')
  })
})

describe('resetGoidanichState', () => {
  it('returns to the initial state', () => {
    expect(resetGoidanichState()).toEqual(initialGoidanichState())
  })
})
