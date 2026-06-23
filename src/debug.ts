import type { LatLng } from './data/provider';
import { detourGallons, gallonsNeeded, isFresh, selectedGrade, type Relaxations } from './engine/engine';
import type { Candidate, FuelGrade, UserSettings } from './engine/types';

/**
 * DEBUG ONLY. Diagnostic trace of every candidate the engine saw, including
 * ones the real decision filtered out (and why). This is a read-only mirror
 * of the filter/cost logic in engine.ts for display purposes — it does not
 * feed back into any decision and must never be used to compute a verdict.
 * Visible only behind the ?debug=true URL flag (see main.ts).
 */
export interface DebugCandidateRow {
  placeId: string;
  name: string;
  club: string | null;
  distanceMiles: number;
  distanceSource: 'routed' | 'estimated' | 'mock' | 'unknown';
  priceForGrade: number | null;
  gallonsNeeded: number;
  detourGallons: number;
  effectiveCost: number | null;
  /** Empty = this candidate is in the eligible set; otherwise the failing checks. */
  excludedBy: string[];
}

export interface DebugTrace {
  grade: FuelGrade;
  sliderFraction: number;
  generatedAt: string;
  rows: DebugCandidateRow[];
}

export function buildDebugTrace(
  candidates: Candidate[],
  settings: UserSettings,
  sliderFraction: number,
  now: Date,
  relax: Relaxations = {},
): DebugTrace {
  const grade = selectedGrade(settings);

  const rows: DebugCandidateRow[] = candidates.map((c) => {
    const reasons: string[] = [];

    if (c.station.club !== null && !settings.clubMemberships.includes(c.station.club)) {
      reasons.push(`club filter: "${c.station.club}" — not a member`);
    }
    if (settings.topTierOnly && !relax.topTier && !c.station.isTopTier) {
      reasons.push('Top Tier filter: not a certified brand');
    }
    const quote = c.station.prices[grade];
    if (!quote) {
      reasons.push(`grade filter: no ${grade} price reported`);
    } else if (!relax.staleness && !isFresh(quote, now)) {
      reasons.push('staleness filter: price older than 12h');
    }

    const gNeeded = gallonsNeeded(sliderFraction, settings.vehicle.tankCapacityGal);
    const dGal = detourGallons(c.roundTripExtraMiles, settings.vehicle.combinedMpg);
    const cost = quote ? (gNeeded + dGal) * quote.price : null;

    return {
      placeId: c.station.placeId,
      name: c.station.name,
      club: c.station.club,
      distanceMiles: c.distanceMiles,
      distanceSource: c.distanceSource ?? 'unknown',
      priceForGrade: quote?.price ?? null,
      gallonsNeeded: gNeeded,
      detourGallons: dGal,
      effectiveCost: cost,
      excludedBy: reasons,
    };
  });

  // Farthest first surfaces exactly the symptom being diagnosed (stations
  // much farther away than the search radius should allow).
  rows.sort((a, b) => b.distanceMiles - a.distanceMiles);

  return { grade, sliderFraction, generatedAt: now.toISOString(), rows };
}

/** Reads the debug flag from the page URL: gasmath.app?debug=true. */
export function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === 'true';
}

/**
 * ?lat=&?lng= override real geolocation for testing — e.g.
 * gasmath.app?debug=true&lat=42.7004&lng=-74.9241 runs the full engine as if
 * physically in Cooperstown, NY, with no GPS and no permission prompt.
 * ONLY active alongside ?debug=true; both params must be present and parse to
 * finite numbers, or there is no override (normal geolocation flow runs).
 */
export function getDebugLocationOverride(): LatLng | null {
  if (!isDebugMode()) return null;
  const params = new URLSearchParams(window.location.search);
  const latStr = params.get('lat');
  const lngStr = params.get('lng');
  if (latStr === null || lngStr === null) return null;
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
