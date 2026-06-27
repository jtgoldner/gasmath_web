import { describe, expect, it } from 'vitest';
import type { Candidate, Station } from './engine/types';
import { extractStateFromAddress, isInNewJerseyBoundingBox, isUserInNewJersey } from './location';

function station(address?: string, overrides: Partial<Station> = {}): Station {
  return {
    placeId: 'p',
    name: 'Station',
    address,
    brand: 'Brand',
    club: null,
    isTopTier: true,
    prices: {},
    ...overrides,
  };
}

function candidate(distanceMiles: number, address?: string): Candidate {
  return { station: station(address), distanceMiles, roundTripExtraMiles: 2 * distanceMiles };
}

describe('extractStateFromAddress', () => {
  it('extracts the state from a standard USPS-formatted address', () => {
    expect(extractStateFromAddress('123 Main St, Cherry Hill, NJ 08002, USA')).toBe('NJ');
    expect(extractStateFromAddress('108 Chestnut St, Cooperstown, NY 13326, USA')).toBe('NY');
    expect(extractStateFromAddress('4684 Desert Color Pkwy, St. George, UT 84790, USA')).toBe('UT');
  });

  it('handles a ZIP+4 and an address with no trailing country', () => {
    expect(extractStateFromAddress('1 Elm St, Trenton, NJ 08608-1234')).toBe('NJ');
  });

  it('returns null when no state code is present', () => {
    expect(extractStateFromAddress('101 Main St, Springfield')).toBeNull();
    expect(extractStateFromAddress('')).toBeNull();
  });
});

describe('isInNewJerseyBoundingBox', () => {
  it('is true for Trenton, NJ', () => {
    expect(isInNewJerseyBoundingBox({ lat: 40.2206, lng: -74.7597 })).toBe(true);
  });

  it('is false for somewhere clearly outside NJ', () => {
    expect(isInNewJerseyBoundingBox({ lat: 39.5, lng: -116.5 })).toBe(false); // Nevada desert
  });
});

describe('isUserInNewJersey', () => {
  it('trusts a derivable state from the nearest candidate address over the bounding box', () => {
    // Bounding box would say "in NJ" for this lat/lng, but the nearest
    // station's real address says New York — address data wins.
    const candidates = [candidate(2, '1 Broadway, New York, NY 10004, USA')];
    expect(isUserInNewJersey({ lat: 40.71, lng: -74.0 }, candidates)).toBe(false);
  });

  it('returns true when the nearest address-bearing candidate is in NJ', () => {
    const candidates = [
      candidate(5, '1 Elm St, Trenton, NJ 08608, USA'),
      candidate(20, '1 Broadway, New York, NY 10004, USA'),
    ];
    expect(isUserInNewJersey({ lat: 40.22, lng: -74.76 }, candidates)).toBe(true);
  });

  it('skips candidates with no address and uses the nearest one that has a derivable state', () => {
    const candidates = [
      candidate(1, undefined),
      candidate(2, '101 Main St, Springfield'), // no state in mock-style address
      candidate(3, '1 Elm St, Trenton, NJ 08608, USA'),
    ];
    expect(isUserInNewJersey({ lat: 40.22, lng: -74.76 }, candidates)).toBe(true);
  });

  it('falls back to the bounding box when no candidate yields a derivable state', () => {
    const candidates = [candidate(1, '101 Main St, Springfield')];
    expect(isUserInNewJersey({ lat: 40.2206, lng: -74.7597 }, candidates)).toBe(true); // Trenton-ish
    expect(isUserInNewJersey({ lat: 39.5, lng: -116.5 }, candidates)).toBe(false); // Nevada desert
  });

  it('falls back to the bounding box with zero candidates', () => {
    expect(isUserInNewJersey({ lat: 40.2206, lng: -74.7597 }, [])).toBe(true);
  });
});
