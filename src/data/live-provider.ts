import type { WireStation } from '../../api/stations';
import {
  filterCandidates,
  selectedGrade,
  selectRoutingCandidates,
  type Relaxations,
} from '../engine/engine';
import type { Candidate, ClubBrand, PriceQuote, Station } from '../engine/types';
import type { AppSettings } from '../storage';
import type { LatLng, StationProvider } from './provider';
import { isTopTierBrand } from './top-tier';

/**
 * Live provider: stations from the Places proxy, driving distances from the
 * ORS proxy. Routing fan-out is capped: only candidates eligible under the
 * current filters are routed (nearest + cheapest, see selectRoutingCandidates).
 * Ineligible candidates are returned with straight-line *estimates* — they
 * only ever back relaxation offers, never a verdict; accepting an offer
 * re-fetches with the relaxation applied so the new set gets real routing.
 */

const EARTH_RADIUS_MI = 3958.8;

function haversineMiles(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

/** Typical road-distance inflation over the straight line, for estimates only. */
const CIRCUITY = 1.3;

export function detectClub(name: string): ClubBrand | null {
  const n = name.toLowerCase();
  if (n.includes('costco')) return 'costco';
  if (/\bbj'?s\b/.test(n)) return 'bjs';
  return null;
}

function reviveQuote(wire: { price: number; updatedAt: string } | undefined): PriceQuote | undefined {
  return wire ? { price: wire.price, updatedAt: new Date(wire.updatedAt) } : undefined;
}

function toStation(w: WireStation): Station {
  return {
    placeId: w.placeId,
    name: w.name,
    brand: w.name,
    club: detectClub(w.name),
    isTopTier: isTopTierBrand(w.name),
    prices: {
      ...(w.prices.regular ? { regular: reviveQuote(w.prices.regular)! } : {}),
      ...(w.prices.premium ? { premium: reviveQuote(w.prices.premium)! } : {}),
    },
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${url} returned ${resp.status}`);
  return resp.json() as Promise<T>;
}

export const liveProvider: StationProvider = {
  async getCandidates(
    location: LatLng,
    settings: AppSettings,
    relax: Relaxations = {},
  ): Promise<Candidate[]> {
    const { stations } = await postJson<{ stations: WireStation[] }>('/api/stations', {
      lat: location.lat,
      lng: location.lng,
      clubs: settings.clubMemberships,
    });

    const entries = stations.map((w) => {
      const station = toStation(w);
      const straightLineMiles = haversineMiles(location, { lat: w.lat, lng: w.lng });
      const estimate: Candidate = {
        station,
        distanceMiles: straightLineMiles * CIRCUITY,
        roundTripExtraMiles: 2 * straightLineMiles * CIRCUITY,
      };
      return { station, loc: { lat: w.lat, lng: w.lng }, straightLineMiles, estimate };
    });

    const provisional = entries.map((e) => e.estimate);
    const eligible = filterCandidates(provisional, settings, new Date(), relax);
    // Nothing eligible: return estimates so the engine can compute which
    // relaxation to offer. No verdict is ever rendered from these.
    if (eligible.length === 0) return provisional;

    const eligibleIds = new Set(eligible.map((c) => c.station.placeId));
    const seeds = selectRoutingCandidates(
      entries
        .filter((e) => eligibleIds.has(e.station.placeId))
        .map((e) => ({ station: e.station, straightLineMiles: e.straightLineMiles })),
      selectedGrade(settings),
    );

    const byId = new Map(entries.map((e) => [e.station.placeId, e]));
    const { distancesMiles } = await postJson<{ distancesMiles: (number | null)[] }>('/api/route', {
      origin: location,
      destinations: seeds.map((s) => byId.get(s.station.placeId)!.loc),
    });

    const routed: Candidate[] = [];
    seeds.forEach((seed, i) => {
      const d = distancesMiles[i];
      if (typeof d !== 'number') return; // unroutable → excluded (never guess)
      routed.push({ station: seed.station, distanceMiles: d, roundTripExtraMiles: 2 * d });
    });

    const ineligible = provisional.filter((c) => !eligibleIds.has(c.station.placeId));
    return [...routed, ...ineligible];
  },
};
