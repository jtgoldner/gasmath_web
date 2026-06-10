import { describe, expect, it } from 'vitest';
import { MAX_ROUTING_CANDIDATES, STALENESS_HOURS, TIE_BREAK_DOLLARS } from '../config';
import {
  decide,
  detourGallons,
  effectiveCost,
  filterCandidates,
  gallonsNeeded,
  isFresh,
  selectRoutingCandidates,
} from './engine';
import type { Candidate, PriceQuote, Station, UserSettings } from './types';

const NOW = new Date('2026-06-10T12:00:00Z');

function quote(price: number, hoursAgo = 1): PriceQuote {
  return { price, updatedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000) };
}

let nextId = 0;
function station(overrides: Partial<Station> = {}): Station {
  nextId += 1;
  return {
    placeId: `place-${nextId}`,
    name: `Station ${nextId}`,
    brand: 'Shell',
    club: null,
    isTopTier: true,
    prices: { regular: quote(3.0) },
    ...overrides,
  };
}

function candidate(distanceMiles: number, overrides: Partial<Station> = {}): Candidate {
  return {
    station: station(overrides),
    distanceMiles,
    roundTripExtraMiles: 2 * distanceMiles,
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

describe('cost math (PRD §6)', () => {
  it('gallons needed = slider fraction × tank capacity', () => {
    expect(gallonsNeeded(0.5, 15)).toBeCloseTo(7.5);
    expect(gallonsNeeded(0, 15)).toBe(0);
    expect(gallonsNeeded(1, 12.4)).toBeCloseTo(12.4);
  });

  it('detour gallons = round-trip extra miles ÷ mpg', () => {
    expect(detourGallons(6, 30)).toBeCloseTo(0.2);
  });

  it('effective cost = (gallons needed + detour gallons) × price', () => {
    const c = candidate(3, { prices: { regular: quote(3.0) } }); // round trip 6 mi
    expect(effectiveCost(c, settings(), 0.5)).toBeCloseTo((7.5 + 0.2) * 3.0);
  });

  it('throws if the station lacks a price for the selected grade', () => {
    const c = candidate(1, { prices: {} });
    expect(() => effectiveCost(c, settings(), 0.5)).toThrow();
  });
});

describe('staleness (PRD Q5: 12-hour threshold)', () => {
  it('accepts a price inside the threshold and rejects one outside', () => {
    expect(isFresh(quote(3.0, STALENESS_HOURS - 1), NOW)).toBe(true);
    expect(isFresh(quote(3.0, STALENESS_HOURS + 1), NOW)).toBe(false);
    expect(isFresh(quote(3.0, STALENESS_HOURS), NOW)).toBe(true); // boundary: exactly 12h is fresh
  });

  it('excludes stale-priced stations from the candidate set', () => {
    const fresh = candidate(1);
    const stale = candidate(1, { prices: { regular: quote(2.0, STALENESS_HOURS + 1) } });
    expect(filterCandidates([fresh, stale], settings(), NOW)).toEqual([fresh]);
  });
});

describe('club filter (hard rule: absolute, never relaxed)', () => {
  const costco = () => candidate(1, { club: 'costco', brand: 'Costco', prices: { regular: quote(2.5) } });
  const shell = () => candidate(2, { prices: { regular: quote(3.5) } });

  it('non-members never see club stations, even when cheapest', () => {
    const verdict = decide([costco(), shell()], settings(), 0.5, NOW);
    expect(verdict.kind).toBe('verdict');
    if (verdict.kind === 'verdict') expect(verdict.winner.station.club).toBeNull();
  });

  it('members do see their club stations', () => {
    const verdict = decide([costco(), shell()], settings({ clubMemberships: ['costco'] }), 0.5, NOW);
    if (verdict.kind === 'verdict') expect(verdict.winner.station.club).toBe('costco');
    expect(verdict.kind).toBe('verdict');
  });

  it('club stations stay excluded even with every relaxation applied', () => {
    const only = [costco()];
    expect(filterCandidates(only, settings(), NOW, { topTier: true, staleness: true })).toEqual([]);
  });

  it('an all-club candidate set dead-ends at no-stations, never an offer', () => {
    expect(decide([costco()], settings(), 0.5, NOW).kind).toBe('no-stations');
  });
});

describe('Top Tier filter (PRD §5.1, default ON)', () => {
  it('ON excludes non-Top-Tier stations', () => {
    const tt = candidate(1);
    const off = candidate(1, { isTopTier: false });
    expect(filterCandidates([tt, off], settings(), NOW)).toEqual([tt]);
  });

  it('OFF includes them', () => {
    const off = candidate(1, { isTopTier: false });
    expect(filterCandidates([off], settings({ topTierOnly: false }), NOW)).toEqual([off]);
  });
});

describe('fuel grade (PRD §5.1)', () => {
  it('premium preference excludes stations not reporting premium', () => {
    const both = candidate(1, { prices: { regular: quote(3.0), premium: quote(3.6) } });
    const regOnly = candidate(1, { prices: { regular: quote(2.0) } });
    expect(filterCandidates([both, regOnly], settings({ preferPremium: true }), NOW)).toEqual([both]);
  });

  it('premium preference prices against the premium quote', () => {
    const c = candidate(0, { prices: { regular: quote(3.0), premium: quote(3.6) } });
    expect(effectiveCost(c, settings({ preferPremium: true }), 1)).toBeCloseTo(15 * 3.6);
  });
});

describe('winner selection (PRD §6)', () => {
  it('a nearer, pricier station beats a cheap one when the detour eats the difference', () => {
    // 20 mi away at $2.99: (7.5 + 40/30) × 2.99 ≈ $26.41
    const cheapFar = candidate(20, { prices: { regular: quote(2.99) } });
    // 1 mi away at $3.09: (7.5 + 2/30) × 3.09 ≈ $23.38
    const nearMid = candidate(1, { prices: { regular: quote(3.09) } });
    const verdict = decide([cheapFar, nearMid], settings(), 0.5, NOW);
    if (verdict.kind === 'verdict') {
      expect(verdict.winner.station.placeId).toBe(nearMid.station.placeId);
    }
    expect(verdict.kind).toBe('verdict');
  });

  it('within the $0.05 tie window, the nearer station wins', () => {
    const s = settings({ vehicle: { combinedMpg: 20, tankCapacityGal: 10 } });
    const far = candidate(1, { prices: { regular: quote(2.5) } }); // (10 + 0.1) × 2.50 = 25.25
    const near = candidate(0.5, { prices: { regular: quote(2.515) } }); // (10 + 0.05) × 2.515 ≈ 25.28
    const costDelta =
      effectiveCost(near, s, 1) - effectiveCost(far, s, 1);
    expect(Math.abs(costDelta)).toBeLessThanOrEqual(TIE_BREAK_DOLLARS); // sanity: it is a tie
    const verdict = decide([far, near], s, 1, NOW);
    if (verdict.kind === 'verdict') {
      expect(verdict.winner.station.placeId).toBe(near.station.placeId);
    }
    expect(verdict.kind).toBe('verdict');
  });

  it('outside the tie window, the cheaper station wins even if farther', () => {
    const cheapFar = candidate(2, { prices: { regular: quote(2.5) } });
    const pricierNear = candidate(1, { prices: { regular: quote(3.5) } });
    const verdict = decide([cheapFar, pricierNear], settings(), 0.5, NOW);
    if (verdict.kind === 'verdict') {
      expect(verdict.winner.station.placeId).toBe(cheapFar.station.placeId);
    }
    expect(verdict.kind).toBe('verdict');
  });
});

describe('savings baseline (PRD §5.2: vs. nearest eligible station)', () => {
  it('reports savings versus the nearest eligible station', () => {
    const nearest = candidate(1, { prices: { regular: quote(3.5) } });
    const winner = candidate(5, { prices: { regular: quote(2.5) } });
    const verdict = decide([nearest, winner], settings(), 0.5, NOW);
    expect(verdict.kind).toBe('verdict');
    if (verdict.kind === 'verdict') {
      expect(verdict.nearest.station.placeId).toBe(nearest.station.placeId);
      expect(verdict.savings).toBeCloseTo(verdict.nearestCost - verdict.winnerCost);
      expect(verdict.savings).toBeGreaterThan(0);
      expect(verdict.winnerIsNearest).toBe(false);
    }
  });

  it('an ineligible nearer station is not the baseline', () => {
    const nearButNotTopTier = candidate(0.5, { isTopTier: false, prices: { regular: quote(2.0) } });
    const eligibleNear = candidate(2, { prices: { regular: quote(3.2) } });
    const eligibleFar = candidate(6, { prices: { regular: quote(2.8) } });
    const verdict = decide([nearButNotTopTier, eligibleNear, eligibleFar], settings(), 0.5, NOW);
    expect(verdict.kind).toBe('verdict');
    if (verdict.kind === 'verdict') {
      expect(verdict.nearest.station.placeId).toBe(eligibleNear.station.placeId);
    }
  });

  it('flags winner == nearest so the UI can show affirming copy', () => {
    const best = candidate(1, { prices: { regular: quote(2.8) } });
    const other = candidate(4, { prices: { regular: quote(3.4) } });
    const verdict = decide([best, other], settings(), 0.5, NOW);
    expect(verdict.kind).toBe('verdict');
    if (verdict.kind === 'verdict') {
      expect(verdict.winnerIsNearest).toBe(true);
      expect(verdict.savings).toBe(0);
    }
  });
});

describe('progressive relaxation (PRD Q4: Top Tier first, then staleness)', () => {
  it('offers Top Tier relaxation when that alone would yield candidates', () => {
    const offBrand = candidate(1, { isTopTier: false });
    expect(decide([offBrand], settings(), 0.5, NOW).kind).toBe('offer-relax-top-tier');
  });

  it('after accepting Top Tier relaxation, returns a verdict', () => {
    const offBrand = candidate(1, { isTopTier: false });
    const verdict = decide([offBrand], settings(), 0.5, NOW, { topTier: true });
    expect(verdict.kind).toBe('verdict');
  });

  it('skips straight to the staleness offer when Top Tier relaxation would not help', () => {
    // All candidates are Top Tier but stale: relaxing Top Tier changes nothing.
    const staleTT = candidate(1, { prices: { regular: quote(3.0, STALENESS_HOURS + 2) } });
    expect(decide([staleTT], settings(), 0.5, NOW).kind).toBe('offer-relax-staleness');
  });

  it('offers Top Tier first when only the combination of both relaxations helps', () => {
    const staleOffBrand = candidate(1, {
      isTopTier: false,
      prices: { regular: quote(3.0, STALENESS_HOURS + 2) },
    });
    expect(decide([staleOffBrand], settings(), 0.5, NOW).kind).toBe('offer-relax-top-tier');
    expect(decide([staleOffBrand], settings(), 0.5, NOW, { topTier: true }).kind).toBe(
      'offer-relax-staleness',
    );
    expect(decide([staleOffBrand], settings(), 0.5, NOW, { topTier: true, staleness: true }).kind).toBe(
      'verdict',
    );
  });

  it('returns no-stations when no relaxation can produce a candidate', () => {
    const noGrade = candidate(1, { prices: {} });
    expect(decide([noGrade], settings(), 0.5, NOW).kind).toBe('no-stations');
    expect(decide([], settings(), 0.5, NOW).kind).toBe('no-stations');
  });
});

describe('routing pre-filter (MAX_ROUTING_CANDIDATES cap)', () => {
  function seeds(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      station: station({ prices: { regular: quote(3.0 + i * 0.01) } }),
      straightLineMiles: count - i, // cheapest stations are the farthest
    }));
  }

  it('passes everything through when under the cap', () => {
    const s = seeds(MAX_ROUTING_CANDIDATES - 1);
    expect(selectRoutingCandidates(s, 'regular')).toEqual(s);
  });

  it('caps the set and always keeps the nearest station', () => {
    const s = seeds(20);
    const picked = selectRoutingCandidates(s, 'regular');
    expect(picked).toHaveLength(MAX_ROUTING_CANDIDATES);
    const nearest = s.reduce((a, b) => (b.straightLineMiles < a.straightLineMiles ? b : a));
    expect(picked).toContain(nearest);
  });

  it('fills remaining slots with the cheapest stations', () => {
    const s = seeds(20);
    const picked = selectRoutingCandidates(s, 'regular');
    const cheapest = [...s].sort(
      (a, b) => a.station.prices.regular!.price - b.station.prices.regular!.price,
    )[0];
    expect(picked).toContain(cheapest);
  });
});
