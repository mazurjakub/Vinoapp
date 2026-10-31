/**
 * File: goidanichActivation.ts
 * Created: 2026-10-20
 * Description: Determines the date the Goidanich index accumulates from, or that it is inactive.
 */

/**
 * The date the Goidanich index accumulates from, or `undefined` while it's
 * inactive. The index needs a primary 3-10 event this season. A downy spray
 * resets it, and it then stays inactive until a new primary event after that
 * spray, so it never restarts from the spray date itself.
 */
export function resolveGoidanichActiveSince(
  primaryEventDates: string[],
  latestDownySprayDate: string | undefined,
): string | undefined {
  const sorted = [...primaryEventDates].sort()
  if (!latestDownySprayDate) return sorted[0]
  return sorted.find((date) => date > latestDownySprayDate)
}
