import type { LatLng } from './data/provider';
import type { Candidate } from './engine/types';

/**
 * Extracts a 2-letter US state code from a USPS-style formatted address
 * ("…, City, ST ZIP[-ZIP4][, Country]"), e.g. Google Places' formattedAddress.
 * Returns null if no state code is present (e.g. the deterministic mock
 * dataset's fictional "City, Country"-less addresses).
 */
export function extractStateFromAddress(address: string): string | null {
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}(-\d{4})?(,|$)/);
  return match ? match[1] : null;
}

/**
 * Lightweight rectangular approximation of New Jersey's extent — NOT precise
 * at the borders (it also covers slivers of NY/PA/DE). Intentional: this is
 * only a fallback for when no real address data is available to derive the
 * state from, and the banner it gates is low-stakes informational copy.
 */
const NJ_BOUNDING_BOX = { minLat: 38.78, maxLat: 41.36, minLng: -75.6, maxLng: -73.88 };

export function isInNewJerseyBoundingBox(location: LatLng): boolean {
  return (
    location.lat >= NJ_BOUNDING_BOX.minLat &&
    location.lat <= NJ_BOUNDING_BOX.maxLat &&
    location.lng >= NJ_BOUNDING_BOX.minLng &&
    location.lng <= NJ_BOUNDING_BOX.maxLng
  );
}

/**
 * Is the user in New Jersey? Prefers state data already on hand from the
 * Places search response (the nearest candidate with a parseable address) —
 * no extra reverse-geocode call. Falls back to the bounding-box approximation
 * only when no candidate address yields a state at all.
 */
export function isUserInNewJersey(location: LatLng, candidates: Candidate[]): boolean {
  const byDistance = [...candidates].sort((a, b) => a.distanceMiles - b.distanceMiles);
  for (const c of byDistance) {
    const state = c.station.address ? extractStateFromAddress(c.station.address) : null;
    if (state) return state === 'NJ';
  }
  return isInNewJerseyBoundingBox(location);
}
