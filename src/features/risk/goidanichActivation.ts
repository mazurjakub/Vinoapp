/**
 * File: goidanichActivation.ts
 * Created: 2026-10-20
 * Description: Determines the date the Goidanich index accumulates from, or that it is inactive.
 */

/**
 * Date the Goidanich index runs from, `undefined` while inactive. It needs a primary event,
 * and a downy spray turns it off until the next primary event after the spray.
 */
export function resolveGoidanichActiveSince(
  primaryEventDates: string[],
  latestDownySprayDate: string | undefined,
): string | undefined {
  const sorted = [...primaryEventDates].sort()
  if (!latestDownySprayDate) return sorted[0]
  return sorted.find((date) => date > latestDownySprayDate)
}
