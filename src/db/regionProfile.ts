/**
 * File: regionProfile.ts
 * Created: 2026-10-02
 * Description: Picks the default regional profile from a plot's coordinates.
 */

import type { RegionProfileId } from './schema'

/** Rough bounding box for the Czech Republic. */
const CZ_BOUNDS = { minLat: 48.5, maxLat: 51.1, minLon: 12.0, maxLon: 18.9 }

export function defaultRegionProfileFor(lat: number, lon: number): RegionProfileId {
  const inCzechia =
    lat >= CZ_BOUNDS.minLat && lat <= CZ_BOUNDS.maxLat && lon >= CZ_BOUNDS.minLon && lon <= CZ_BOUNDS.maxLon
  return inCzechia ? 'cz-morava' : 'eu-generic'
}
