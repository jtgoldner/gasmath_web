import { describe, expect, it } from 'vitest';
import { boundingBox, haversineMeters } from '../api/stations';
import { detectClub } from './data/live-provider';

/**
 * Guards the two halves of the club-query radius fix:
 *  1. searchText can only be bounded by a RECTANGLE, so the box must fully
 *     contain the search circle — a box that clips it silently loses
 *     in-radius stations.
 *  2. That box overshoots at its corners, so the circle has to be re-enforced
 *     in our own code. Without it, out-of-radius club stations come back.
 */

const SEARCH_RADIUS_M = 50_000;

/** Mirrors the handler's post-filter. */
function withinRadius(origin: { lat: number; lng: number }, p: { lat: number; lng: number }): boolean {
  return haversineMeters(origin, p) <= SEARCH_RADIUS_M;
}

describe('boundingBox', () => {
  it('fully contains the search circle at every latitude', () => {
    for (let lat = -80; lat <= 80; lat += 2.5) {
      const box = boundingBox(lat, 0, SEARCH_RADIUS_M);
      // Due north and due east must both still be inside the box, or the
      // rectangle is a tighter filter than the circle it stands in for.
      const north = haversineMeters({ lat, lng: 0 }, { lat: box.high.latitude, lng: 0 });
      const east = haversineMeters({ lat, lng: 0 }, { lat, lng: box.high.longitude });
      expect(north).toBeGreaterThanOrEqual(SEARCH_RADIUS_M - 1e-6);
      expect(east).toBeGreaterThanOrEqual(SEARCH_RADIUS_M - 1e-6);
    }
  });

  it('overshoots at the corners — which is exactly why the post-filter exists', () => {
    const box = boundingBox(40.894, -73.769, SEARCH_RADIUS_M);
    const corner = haversineMeters(
      { lat: 40.894, lng: -73.769 },
      { lat: box.high.latitude, lng: box.high.longitude },
    );
    expect(corner).toBeGreaterThan(SEARCH_RADIUS_M * 1.4); // ~70.6 km vs 50 km
    expect(withinRadius({ lat: 40.894, lng: -73.769 }, { lat: box.high.latitude, lng: box.high.longitude })).toBe(false);
  });

  it('stays within valid lat/lng bounds near the poles', () => {
    const box = boundingBox(89.9, 0, SEARCH_RADIUS_M);
    expect(box.high.latitude).toBeLessThanOrEqual(90);
    expect(box.low.latitude).toBeGreaterThanOrEqual(-90);
    expect(box.high.longitude).toBeLessThanOrEqual(180);
    expect(box.low.longitude).toBeGreaterThanOrEqual(-180);
  });
});

describe('club radius post-filter', () => {
  const origin = { lat: 41.5, lng: -87.9 };

  it('keeps a station inside the radius and discards one beyond it', () => {
    // Due north: ~45 km in, ~60 km out (inside the box's 70 km corner reach).
    const inside = { lat: origin.lat + 0.4, lng: origin.lng };
    const outside = { lat: origin.lat + 0.55, lng: origin.lng };
    expect(withinRadius(origin, inside)).toBe(true);
    expect(withinRadius(origin, outside)).toBe(false);
  });

  it('discards a corner station the rectangle would have allowed through', () => {
    const box = boundingBox(origin.lat, origin.lng, SEARCH_RADIUS_M);
    const corner = { lat: box.high.latitude, lng: box.high.longitude };
    // Inside the rectangle Google filtered on...
    expect(corner.lat).toBeLessThanOrEqual(box.high.latitude);
    expect(corner.lng).toBeLessThanOrEqual(box.high.longitude);
    // ...but outside the circle we actually promise.
    expect(withinRadius(origin, corner)).toBe(false);
  });
});

describe('club query strings match what Places returns', () => {
  // Names observed live from the supplemental Text Search (2026-07-31). The
  // query string only has to surface the place; detectClub() is what actually
  // classifies it, so these must agree or the club is found and then ignored.
  it.each([
    ['Costco Gas Station', 'costco'],
    ["BJ's Gas Station", 'bjs'],
    ["BJ's Gas", 'bjs'],
    ["Sam's Club Gas Station", 'samsclub'],
  ])('%s is detected as %s', (name, expected) => {
    expect(detectClub(name)).toBe(expected);
  });

  it('does not classify ordinary stations as club brands', () => {
    expect(detectClub('Shell')).toBeNull();
    expect(detectClub('Quality Fuel')).toBeNull();
  });
});
