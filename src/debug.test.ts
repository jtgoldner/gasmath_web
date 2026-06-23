// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildDebugTrace, buildDebugVehicleInfo, getDebugLocationOverride, isDebugMode } from './debug';
import type { Candidate, PriceQuote, Station, UserSettings } from './engine/types';
import type { AppSettings } from './storage';

const NOW = new Date('2026-06-13T12:00:00Z');

function quote(price: number, hoursAgo = 1): PriceQuote {
  return { price, updatedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000) };
}

function station(overrides: Partial<Station> = {}): Station {
  return {
    placeId: 'p1',
    name: 'Test Station',
    brand: 'Test',
    club: null,
    isTopTier: true,
    prices: { regular: quote(3.0) },
    ...overrides,
  };
}

function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    vehicle: { combinedMpg: 30, tankCapacityGal: 15 },
    clubMemberships: [],
    topTierOnly: true,
    preferPremium: false,
    ...overrides,
  };
}

describe('buildDebugTrace', () => {
  it('marks an eligible candidate with no excludedBy reasons and the right cost', () => {
    const c: Candidate = {
      station: station(),
      distanceMiles: 1,
      roundTripExtraMiles: 2,
      distanceSource: 'routed',
    };
    const trace = buildDebugTrace([c], settings(), 0.5, NOW);
    expect(trace.rows).toHaveLength(1);
    const row = trace.rows[0];
    expect(row.excludedBy).toEqual([]);
    expect(row.distanceSource).toBe('routed');
    expect(row.gallonsNeeded).toBeCloseTo(7.5);
    expect(row.detourGallons).toBeCloseTo(2 / 30);
    expect(row.effectiveCost).toBeCloseTo((7.5 + 2 / 30) * 3.0);
  });

  it('reports the club filter reason for a non-member candidate', () => {
    const c: Candidate = {
      station: station({ club: 'costco' }),
      distanceMiles: 150,
      roundTripExtraMiles: 300,
    };
    const trace = buildDebugTrace([c], settings(), 0.5, NOW);
    expect(trace.rows[0].excludedBy).toEqual(['club filter: "costco" — not a member']);
    // Cost is still computed for diagnostic visibility even though it's excluded.
    expect(trace.rows[0].effectiveCost).not.toBeNull();
  });

  it('reports Top Tier, grade, and staleness reasons independently', () => {
    const offBrand: Candidate = {
      station: station({ placeId: 'off-brand', isTopTier: false }),
      distanceMiles: 1,
      roundTripExtraMiles: 2,
    };
    const noGrade: Candidate = {
      station: station({ placeId: 'no-grade', prices: {} }),
      distanceMiles: 1,
      roundTripExtraMiles: 2,
    };
    const stale: Candidate = {
      station: station({ placeId: 'stale', prices: { regular: quote(3.0, 999) } }),
      distanceMiles: 1,
      roundTripExtraMiles: 2,
    };
    const trace = buildDebugTrace([offBrand, noGrade, stale], settings(), 0.5, NOW);
    const byPlaceId = (id: string) => trace.rows.find((r) => r.placeId === id)!;

    expect(byPlaceId('off-brand').excludedBy).toEqual(['Top Tier filter: not a certified brand']);
    expect(byPlaceId('no-grade').excludedBy).toEqual(['grade filter: no regular price reported']);
    expect(byPlaceId('no-grade').effectiveCost).toBeNull();
    expect(byPlaceId('stale').excludedBy).toEqual(['staleness filter: price older than 12h']);
  });

  it('sorts rows farthest first, surfacing far-away candidates immediately', () => {
    const near: Candidate = { station: station({ placeId: 'near' }), distanceMiles: 2, roundTripExtraMiles: 4 };
    const far: Candidate = { station: station({ placeId: 'far' }), distanceMiles: 150, roundTripExtraMiles: 300 };
    const trace = buildDebugTrace([near, far], settings(), 0.5, NOW);
    expect(trace.rows[0].placeId).toBe('far');
    expect(trace.rows[1].placeId).toBe('near');
  });

  it('respects relaxations the same way the engine does', () => {
    const offBrand: Candidate = {
      station: station({ isTopTier: false }),
      distanceMiles: 1,
      roundTripExtraMiles: 2,
    };
    const withoutRelax = buildDebugTrace([offBrand], settings(), 0.5, NOW);
    expect(withoutRelax.rows[0].excludedBy).toContain('Top Tier filter: not a certified brand');

    const withRelax = buildDebugTrace([offBrand], settings(), 0.5, NOW, { topTier: true });
    expect(withRelax.rows[0].excludedBy).toEqual([]);
  });
});

describe('buildDebugVehicleInfo', () => {
  it('pulls year/make/model and the EPA combined MPG/tank used for the session', () => {
    const appSettings: AppSettings = {
      vehicleId: { year: 2024, make: 'Toyota', model: 'Camry' },
      vehicle: { combinedMpg: 32, tankCapacityGal: 15.8 },
      clubMemberships: [],
      topTierOnly: true,
      preferPremium: false,
    };
    expect(buildDebugVehicleInfo(appSettings)).toEqual({
      year: 2024,
      make: 'Toyota',
      model: 'Camry',
      combinedMpg: 32,
      tankCapacityGal: 15.8,
    });
  });
});

describe('isDebugMode', () => {
  it('is false with no debug param', () => {
    window.history.pushState(null, '', '/');
    expect(isDebugMode()).toBe(false);
  });

  it('is true only for ?debug=true', () => {
    window.history.pushState(null, '', '/?debug=true');
    expect(isDebugMode()).toBe(true);

    window.history.pushState(null, '', '/?debug=1');
    expect(isDebugMode()).toBe(false);
  });
});

describe('getDebugLocationOverride', () => {
  it('returns the override when debug=true and both lat/lng parse to numbers', () => {
    window.history.pushState(null, '', '/?debug=true&lat=42.7004&lng=-74.9241');
    expect(getDebugLocationOverride()).toEqual({ lat: 42.7004, lng: -74.9241 });
  });

  it('is null without ?debug=true, even if lat/lng are present', () => {
    window.history.pushState(null, '', '/?lat=42.7004&lng=-74.9241');
    expect(getDebugLocationOverride()).toBeNull();
  });

  it('is null when only one of lat/lng is present', () => {
    window.history.pushState(null, '', '/?debug=true&lat=42.7004');
    expect(getDebugLocationOverride()).toBeNull();

    window.history.pushState(null, '', '/?debug=true&lng=-74.9241');
    expect(getDebugLocationOverride()).toBeNull();
  });

  it('is null when lat or lng do not parse to a finite number', () => {
    window.history.pushState(null, '', '/?debug=true&lat=notanumber&lng=-74.9241');
    expect(getDebugLocationOverride()).toBeNull();
  });

  it('is null when debug=true but no lat/lng are present', () => {
    window.history.pushState(null, '', '/?debug=true');
    expect(getDebugLocationOverride()).toBeNull();
  });
});
