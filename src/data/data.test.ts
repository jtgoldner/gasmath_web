import { describe, expect, it } from 'vitest';
import { detectClub } from './live-provider';
import { isTopTierBrand } from './top-tier';

describe('Top Tier brand matching (PRD Q8: fuzzy on station names)', () => {
  it('matches certified brands however the station is named', () => {
    expect(isTopTierBrand('Shell')).toBe(true);
    expect(isTopTierBrand('Costco Gasoline')).toBe(true);
    expect(isTopTierBrand('QuikTrip #482')).toBe(true);
    expect(isTopTierBrand('Chevron - Downtown')).toBe(true);
    expect(isTopTierBrand("Casey's General Store")).toBe(true);
  });

  it('rejects unlisted and off-brand stations', () => {
    expect(isTopTierBrand("Joe's Discount Gas")).toBe(false);
    expect(isTopTierBrand('Speedway')).toBe(false);
    expect(isTopTierBrand("BJ's Gas")).toBe(false);
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
  });

  it('returns null for everything else', () => {
    expect(detectClub('Shell')).toBeNull();
    expect(detectClub('Buc-ees')).toBeNull();
  });
});
