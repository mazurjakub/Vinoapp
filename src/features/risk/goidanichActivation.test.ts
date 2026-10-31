/**
 * File: goidanichActivation.test.ts
 * Created: 2026-10-20
 * Description: Tests when the Goidanich index becomes active and how sprays reset it.
 */

import { describe, expect, it } from 'vitest'
import { resolveGoidanichActiveSince } from './goidanichActivation'

describe('resolveGoidanichActiveSince', () => {
  it('activates from the earliest primary event when there is no spray', () => {
    expect(resolveGoidanichActiveSince(['2026-05-10', '2026-05-03'], undefined)).toBe('2026-05-03')
  })

  it('returns undefined when there are no primary events at all', () => {
    expect(resolveGoidanichActiveSince([], undefined)).toBeUndefined()
    expect(resolveGoidanichActiveSince([], '2026-05-05')).toBeUndefined()
  })

  it('deactivates after a spray until a new primary event dated after it', () => {
    expect(resolveGoidanichActiveSince(['2026-05-03'], '2026-05-05')).toBeUndefined()
  })

  it('reactivates from a primary event dated after the spray, not from the spray date', () => {
    expect(resolveGoidanichActiveSince(['2026-05-03', '2026-05-10'], '2026-05-05')).toBe('2026-05-10')
  })

  it('ignores a primary event on the exact spray date (still not "after" it)', () => {
    expect(resolveGoidanichActiveSince(['2026-05-05'], '2026-05-05')).toBeUndefined()
  })

  it('is unaffected by a spray before any primary event', () => {
    expect(resolveGoidanichActiveSince(['2026-05-10'], '2026-04-01')).toBe('2026-05-10')
  })
})
