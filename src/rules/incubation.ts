/**
 * File: incubation.ts
 * Created: 2026-10-02
 * Description: Calculates the downy mildew incubation period from mean temperature.
 */

/**
 * The sources only give these three anchor points. Linear interpolation between
 * them and clamping outside the range are the app's own choice.
 */
const ANCHORS: [tempC: number, days: number][] = [
  [14, 10],
  [18, 6],
  [24, 4], // midpoint of the given 22-26 °C range
]

export function incubationDays(meanTempC: number): number {
  if (meanTempC <= ANCHORS[0][0]) return ANCHORS[0][1]
  const last = ANCHORS[ANCHORS.length - 1]
  if (meanTempC >= last[0]) return last[1]

  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [t1, d1] = ANCHORS[i]
    const [t2, d2] = ANCHORS[i + 1]
    if (meanTempC >= t1 && meanTempC <= t2) {
      const ratio = (meanTempC - t1) / (t2 - t1)
      return d1 + ratio * (d2 - d1)
    }
  }
  return last[1]
}
