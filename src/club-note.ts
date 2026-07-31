import { CLUB_NOTE_MAX_MILES } from './config';
import type { DroppedStation } from './data/provider';
import type { Candidate, ClubBrand, FuelGrade } from './engine/types';

/**
 * DISPLAY ONLY. Picks the one members-only club station near the user that
 * Places gave no usable price for, so the verdict screen can say "there's a
 * Costco nearby, we just don't have its price" instead of silently omitting it.
 *
 * Deliberately imports nothing from engine.ts: this is a note about a station
 * that CANNOT be ranked (no price = no effective cost, hard rule 4). It never
 * feeds the verdict, the savings figure, or the relaxation flow, and these
 * stations are never routed — the distance is always a haversine estimate,
 * which is why the copy says "about".
 */

export interface ClubNote {
  brand: ClubBrand;
  name: string;
  address?: string;
  /** Straight-line estimate × circuity — never an OpenRouteService distance. */
  distanceMiles: number;
}

interface PriceGap {
  club: ClubBrand | null;
  name: string;
  address?: string;
  distanceMiles: number | null;
}

/**
 * Two ways a station ends up with no price for the user:
 *  1. dropped at the proxy — Places returned no usable price at all;
 *  2. reached the engine, but has no price for the grade this user needs.
 * Both look identical to the user ("my club is missing"), so both qualify.
 * Returns the nearest qualifying station, or null. Never more than one.
 */
export function selectClubNote(
  dropped: DroppedStation[],
  candidates: Candidate[],
  grade: FuelGrade,
  memberships: ClubBrand[],
): ClubNote | null {
  const gaps: PriceGap[] = [
    ...dropped.map((d) => ({
      club: d.club,
      name: d.name,
      address: d.address,
      distanceMiles: d.distanceMiles,
    })),
    ...candidates
      .filter((c) => c.station.prices[grade] === undefined)
      .map((c) => ({
        club: c.station.club,
        name: c.station.name,
        address: c.station.address,
        distanceMiles: c.distanceMiles,
      })),
  ];

  let nearest: ClubNote | null = null;
  for (const gap of gaps) {
    // Only clubs the user actually belongs to — a Costco is useless to a
    // non-member, and the club filter is never relaxed (hard rule 3).
    if (gap.club === null || !memberships.includes(gap.club)) continue;
    if (gap.distanceMiles === null || gap.distanceMiles > CLUB_NOTE_MAX_MILES) continue;
    if (nearest === null || gap.distanceMiles < nearest.distanceMiles) {
      nearest = {
        brand: gap.club,
        name: gap.name,
        address: gap.address,
        distanceMiles: gap.distanceMiles,
      };
    }
  }
  return nearest;
}
