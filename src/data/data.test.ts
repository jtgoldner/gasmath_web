import { describe, expect, it } from 'vitest';
import { filterCandidates } from '../engine/engine';
import type { ClubBrand } from '../engine/types';
import type { AppSettings } from '../storage';
import { detectClub } from './live-provider';
import { mockProvider } from './mock-provider';
import { isTopTierBrand } from './top-tier';

describe('Top Tier brand matching (PRD Q8: fuzzy on station names)', () => {
  it('matches certified brands however the station is named', () => {
    expect(isTopTierBrand('Shell')).toBe(true);
    expect(isTopTierBrand('Costco Gasoline')).toBe(true);
    expect(isTopTierBrand('QuikTrip #482')).toBe(true);
    expect(isTopTierBrand('Chevron - Downtown')).toBe(true);
    expect(isTopTierBrand('Gulf Station')).toBe(true);
  });

  it('rejects unlisted and off-brand stations', () => {
    expect(isTopTierBrand("Joe's Discount Gas")).toBe(false);
    expect(isTopTierBrand('Speedway')).toBe(false);
    expect(isTopTierBrand("BJ's Gas")).toBe(false);
    // Not on the toptiergas.com registry despite common assumptions (verified 2026-06-11).
    expect(isTopTierBrand("Casey's General Store")).toBe(false);
    expect(isTopTierBrand('Kwik Trip')).toBe(false);
  });

  it('does not match brand fragments inside other words', () => {
    expect(isTopTierBrand('Shellfish Market Fuel Stop')).toBe(false);
  });
});

describe('warehouse club detection (hard rule 3)', () => {
  it('detects club brands from station names', () => {
    expect(detectClub('Costco Gasoline')).toBe('costco');
    expect(detectClub("BJ's Gas")).toBe('bjs');
    expect(detectClub('BJs Wholesale Club Gas')).toBe('bjs');
    expect(detectClub("Sam's Club Fuel Center")).toBe('samsclub');
    expect(detectClub('Sams Club Gas')).toBe('samsclub');
  });

  it('returns null for everything else', () => {
    expect(detectClub('Shell')).toBeNull();
    expect(detectClub('Buc-ees')).toBeNull();
  });
});

describe('warehouse club toggles respected in results (hard rule 3)', () => {
  const NOW = new Date();
  const ALL_CLUBS: ClubBrand[] = ['costco', 'bjs', 'samsclub'];

  function settingsWith(clubs: ClubBrand[]): AppSettings {
    return {
      vehicleId: { year: 2024, make: 'Toyota', model: 'Camry' },
      vehicle: { combinedMpg: 30, tankCapacityGal: 14 },
      clubMemberships: clubs,
      topTierOnly: false,
      preferPremium: false,
    };
  }

  /** Distinct club brands present in the filtered (visible) candidate set. */
  async function visibleClubs(member: ClubBrand[]): Promise<Set<ClubBrand>> {
    const settings = settingsWith(member);
    const candidates = await mockProvider.getCandidates({ lat: 0, lng: 0 }, settings);
    const visible = filterCandidates(candidates, settings, NOW);
    return new Set(
      visible.map((c) => c.station.club).filter((c): c is ClubBrand => c !== null),
    );
  }

  it('sanity check: the mock data contains all three club stations', async () => {
    const raw = await mockProvider.getCandidates({ lat: 0, lng: 0 }, settingsWith([]));
    const clubs = new Set(raw.map((c) => c.station.club).filter(Boolean));
    expect(clubs).toEqual(new Set(ALL_CLUBS));
  });

  it('hides every club station when the user is a member of none', async () => {
    expect(await visibleClubs([])).toEqual(new Set());
  });

  it('shows ONLY the clubs the user belongs to', async () => {
    expect(await visibleClubs(['samsclub'])).toEqual(new Set(['samsclub']));
    expect(await visibleClubs(['costco', 'bjs'])).toEqual(new Set(['costco', 'bjs']));
  });

  it('shows all three when the user belongs to all three', async () => {
    expect(await visibleClubs(ALL_CLUBS)).toEqual(new Set(ALL_CLUBS));
  });
});
