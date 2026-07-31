import { describe, expect, it } from 'vitest';
import { selectClubNote } from './club-note';
import type { DroppedStation } from './data/provider';
import type { Candidate, ClubBrand, PriceQuote, Station } from './engine/types';

function dropped(overrides: Partial<DroppedStation> = {}): DroppedStation {
  return {
    name: 'Costco Gas Station',
    address: '1 Industrial Ln, New Rochelle, NY 10805, USA',
    club: 'costco',
    distanceMiles: 3,
    reason: 'no fuelOptions data',
    ...overrides,
  };
}

function quote(price: number): PriceQuote {
  return { price, updatedAt: new Date('2026-07-31T12:00:00Z') };
}

function candidate(
  distanceMiles: number,
  club: ClubBrand | null,
  prices: Station['prices'],
  name = 'Station',
): Candidate {
  return {
    station: {
      placeId: `p-${name}-${distanceMiles}`,
      name,
      address: `${name} address`,
      brand: name,
      club,
      isTopTier: true,
      prices,
    },
    distanceMiles,
    roundTripExtraMiles: 2 * distanceMiles,
  };
}

describe('selectClubNote', () => {
  it('returns the club dropped at the proxy for missing price data', () => {
    const note = selectClubNote([dropped()], [], 'regular', ['costco']);
    expect(note).toEqual({
      brand: 'costco',
      name: 'Costco Gas Station',
      address: '1 Industrial Ln, New Rochelle, NY 10805, USA',
      distanceMiles: 3,
    });
  });

  it('returns a candidate that has no price for the selected grade', () => {
    // Reached the engine with a regular price, but the user needs premium.
    const candidates = [candidate(4, 'bjs', { regular: quote(3.19) }, "BJ's Gas")];
    const note = selectClubNote([], candidates, 'premium', ['bjs']);
    expect(note?.brand).toBe('bjs');
    expect(note?.distanceMiles).toBe(4);
  });

  it('ignores a club that does have a price for the selected grade', () => {
    const candidates = [candidate(4, 'bjs', { premium: quote(4.29) }, "BJ's Gas")];
    expect(selectClubNote([], candidates, 'premium', ['bjs'])).toBeNull();
  });

  it('ignores clubs the user is not a member of', () => {
    expect(selectClubNote([dropped({ club: 'costco' })], [], 'regular', ['bjs'])).toBeNull();
    expect(selectClubNote([dropped({ club: 'costco' })], [], 'regular', [])).toBeNull();
  });

  it('ignores non-club stations with no price data', () => {
    const stations = [dropped({ club: null, name: 'Quality Fuel' })];
    expect(selectClubNote(stations, [], 'regular', ['costco'])).toBeNull();
  });

  it('applies the CLUB_NOTE_MAX_MILES cutoff', () => {
    expect(selectClubNote([dropped({ distanceMiles: 10 })], [], 'regular', ['costco'])).not.toBeNull();
    expect(selectClubNote([dropped({ distanceMiles: 10.1 })], [], 'regular', ['costco'])).toBeNull();
  });

  it('skips a dropped place with no location from Places', () => {
    expect(selectClubNote([dropped({ distanceMiles: null })], [], 'regular', ['costco'])).toBeNull();
  });

  it('returns only the nearest when several qualify', () => {
    const stations = [
      dropped({ name: 'Costco far', distanceMiles: 8 }),
      dropped({ name: 'Costco near', distanceMiles: 2, club: 'costco' }),
      dropped({ name: "Sam's Club mid", distanceMiles: 5, club: 'samsclub' }),
    ];
    const note = selectClubNote(stations, [], 'regular', ['costco', 'samsclub']);
    expect(note?.name).toBe('Costco near');
    expect(note?.distanceMiles).toBe(2);
  });

  it('picks the nearest across both sources', () => {
    const candidates = [candidate(1.5, 'samsclub', { regular: quote(3.09) }, "Sam's Club")];
    const note = selectClubNote([dropped({ distanceMiles: 6 })], candidates, 'premium', [
      'costco',
      'samsclub',
    ]);
    expect(note?.brand).toBe('samsclub');
    expect(note?.distanceMiles).toBe(1.5);
  });

  it('returns null when there is nothing to report', () => {
    expect(selectClubNote([], [], 'regular', ['costco', 'bjs', 'samsclub'])).toBeNull();
  });
});
