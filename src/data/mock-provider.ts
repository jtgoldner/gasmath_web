import type { Candidate, ClubBrand, PriceQuote } from '../engine/types';
import type { StationProvider } from './provider';

/**
 * Deterministic mock so the full flow is demoable with no API keys.
 * The set deliberately exercises every engine rule: club stations, a cheap
 * non-Top-Tier station, a stale price, and a station with no premium.
 */

function quote(price: number, hoursOld = 1): PriceQuote {
  return { price, updatedAt: new Date(Date.now() - hoursOld * 3_600_000) };
}

interface MockSpec {
  name: string;
  address: string;
  brand: string;
  club?: ClubBrand;
  topTier: boolean;
  distanceMiles: number;
  regular?: PriceQuote;
  premium?: PriceQuote;
}

const SPECS: MockSpec[] = [
  { name: 'Shell — Main St', address: '101 Main St, Springfield', brand: 'Shell', topTier: true, distanceMiles: 0.6, regular: quote(3.39), premium: quote(4.09) },
  { name: 'ARCO — 5th Ave', address: '540 5th Ave, Springfield', brand: 'ARCO', topTier: false, distanceMiles: 0.9, regular: quote(3.05) },
  { name: 'Mobil — Riverside', address: '88 Riverside Dr, Springfield', brand: 'Mobil', topTier: true, distanceMiles: 1.2, regular: quote(3.29), premium: quote(3.99) },
  { name: 'Chevron — Oak Blvd', address: '1200 Oak Blvd, Springfield', brand: 'Chevron', topTier: true, distanceMiles: 2.4, regular: quote(3.45, 14), premium: quote(4.15, 14) },
  { name: 'Costco Gasoline', address: '75 Warehouse Way, Springfield', brand: 'Costco', club: 'costco', topTier: true, distanceMiles: 3.1, regular: quote(2.99), premium: quote(3.69) },
  { name: "BJ's Gas", address: '300 Member Ln, Springfield', brand: "BJ's", club: 'bjs', topTier: false, distanceMiles: 4.2, regular: quote(3.02) },
  { name: 'Sunoco — Route 9', address: '4501 Route 9, Springfield', brand: 'Sunoco', topTier: true, distanceMiles: 5.8, regular: quote(3.19) },
  { name: 'Speedway — Junction', address: '9 Junction Rd, Springfield', brand: 'Speedway', topTier: false, distanceMiles: 7.5, regular: quote(3.09) },
];

function toCandidate(spec: MockSpec, index: number): Candidate {
  return {
    station: {
      placeId: `mock-${index}`,
      name: spec.name,
      address: spec.address,
      brand: spec.brand,
      club: spec.club ?? null,
      isTopTier: spec.topTier,
      prices: {
        ...(spec.regular ? { regular: spec.regular } : {}),
        ...(spec.premium ? { premium: spec.premium } : {}),
      },
    },
    distanceMiles: spec.distanceMiles,
    // MVP has no destination input: the detour is simply there-and-back.
    roundTripExtraMiles: 2 * spec.distanceMiles,
  };
}

export const mockProvider: StationProvider = {
  async getCandidates() {
    return SPECS.map(toCandidate);
  },
};
