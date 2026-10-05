import { MAX_ROUTING_CANDIDATES, STALENESS_HOURS, TIE_BREAK_DOLLARS } from '../config';
import type { Candidate, FuelGrade, PriceQuote, Station, TripType, UserSettings } from './types';

/** Float-comparison slack for the dollar tie window. */
const EPSILON = 1e-9;

/**
 * How many times the one-way distance to a station counts as detour (PRD §5.2c).
 * Round trip: there and back = 2×. One way: only the leg to the station = 1×.
 *
 * This is the ONLY place the trip type touches the math. Everything that costs
 * a detour — ranking, the winner, both cards, the savings delta, the debug
 * trace — goes through `detourMiles`, so it applies equally to routed (ORS)
 * and estimated (haversine × circuity) distances.
 */
export const TRIP_MULTIPLIER: Record<TripType, number> = {
  round_trip: 2,
  one_way: 1,
};

/** First-visit default, and what any caller that doesn't say gets (PRD §5.2c). */
export const DEFAULT_TRIP_TYPE: TripType = 'round_trip';

export function tripMultiplier(tripType: TripType): number {
  return TRIP_MULTIPLIER[tripType];
}

/** Extra miles driven to use this station: one-way distance × the trip multiplier. */
export function detourMiles(candidate: Candidate, tripType: TripType = DEFAULT_TRIP_TYPE): number {
  return candidate.distanceMiles * tripMultiplier(tripType);
}

export function selectedGrade(settings: UserSettings): FuelGrade {
  return settings.preferPremium ? 'premium' : 'regular';
}

export function gallonsNeeded(sliderFraction: number, tankCapacityGal: number): number {
  return sliderFraction * tankCapacityGal;
}

export function detourGallons(detourMilesDriven: number, mpg: number): number {
  return detourMilesDriven / mpg;
}

/**
 * PRD §6: effective_cost = (gallons_needed + detour_gallons) × station_price,
 * where detour_gallons = (one-way distance × trip multiplier) ÷ mpg.
 * Candidates must already be filtered for grade availability.
 */
export function effectiveCost(
  candidate: Candidate,
  settings: UserSettings,
  sliderFraction: number,
  tripType: TripType = DEFAULT_TRIP_TYPE,
): number {
  const quote = candidate.station.prices[selectedGrade(settings)];
  if (!quote) {
    throw new Error(
      `Station ${candidate.station.placeId} has no ${selectedGrade(settings)} price; filter before costing`,
    );
  }
  const gallons =
    gallonsNeeded(sliderFraction, settings.vehicle.tankCapacityGal) +
    detourGallons(detourMiles(candidate, tripType), settings.vehicle.combinedMpg);
  return gallons * quote.price;
}

export function isFresh(quote: PriceQuote, now: Date): boolean {
  return now.getTime() - quote.updatedAt.getTime() <= STALENESS_HOURS * 3_600_000;
}

/**
 * Filters the user has agreed to relax via progressive relaxation (PRD Q4).
 * The club filter has no relax flag by design — it is never relaxed.
 */
export interface Relaxations {
  topTier?: boolean;
  staleness?: boolean;
}

/** Filter order per CLAUDE.md: club → Top Tier → grade availability → staleness. */
export function filterCandidates(
  candidates: Candidate[],
  settings: UserSettings,
  now: Date,
  relax: Relaxations = {},
): Candidate[] {
  const grade = selectedGrade(settings);
  return candidates
    .filter((c) => c.station.club === null || settings.clubMemberships.includes(c.station.club))
    .filter((c) => !settings.topTierOnly || relax.topTier || c.station.isTopTier)
    .filter((c) => c.station.prices[grade] !== undefined)
    .filter((c) => relax.staleness || isFresh(c.station.prices[grade]!, now));
}

export type Verdict =
  | {
      kind: 'verdict';
      winner: Candidate;
      winnerCost: number;
      /** Nearest eligible station — the "autopilot" savings baseline (PRD §5.2). */
      nearest: Candidate;
      nearestCost: number;
      /** Dollars saved vs. filling at the nearest eligible station. Never negative. */
      savings: number;
      /** True → show affirming copy instead of "$0 savings" (PRD §5.2). */
      winnerIsNearest: boolean;
      /**
       * The trip type every figure above was costed under. Stamped here so the
       * verdict screen's "which assumption produced this?" line reads the very
       * value the math used, rather than a copy that could disagree with it.
       */
      tripType: TripType;
    }
  | { kind: 'offer-relax-top-tier' }
  | { kind: 'offer-relax-staleness' }
  | { kind: 'no-stations' };

/**
 * The decision engine (PRD §6). Pure: same inputs, same verdict.
 *
 * `relax` carries the relaxations the user has already accepted. When the
 * candidate set is empty, the offer returned is the first relaxation — in PRD
 * order: Top Tier, then staleness — that moves toward a non-empty set. The
 * club filter is never offered (hard rule).
 */
export function decide(
  candidates: Candidate[],
  settings: UserSettings,
  sliderFraction: number,
  now: Date,
  relax: Relaxations = {},
  tripType: TripType = DEFAULT_TRIP_TYPE,
): Verdict {
  const eligible = filterCandidates(candidates, settings, now, relax);

  if (eligible.length === 0) {
    const topTierHelps =
      settings.topTierOnly &&
      !relax.topTier &&
      filterCandidates(candidates, settings, now, { ...relax, topTier: true }).length > 0;
    const stalenessHelps =
      !relax.staleness &&
      filterCandidates(candidates, settings, now, { ...relax, staleness: true }).length > 0;
    const bothHelp =
      filterCandidates(candidates, settings, now, { topTier: true, staleness: true }).length > 0;

    if (topTierHelps) return { kind: 'offer-relax-top-tier' };
    if (stalenessHelps) return { kind: 'offer-relax-staleness' };
    // Neither single relaxation suffices, but the combination would: offer in PRD order.
    if (settings.topTierOnly && !relax.topTier && bothHelp) {
      return { kind: 'offer-relax-top-tier' };
    }
    return { kind: 'no-stations' };
  }

  const costed = eligible.map((candidate) => ({
    candidate,
    cost: effectiveCost(candidate, settings, sliderFraction, tripType),
  }));

  const minCost = Math.min(...costed.map((x) => x.cost));
  const contenders = costed.filter((x) => x.cost - minCost <= TIE_BREAK_DOLLARS + EPSILON);
  const winner = contenders.reduce((a, b) =>
    b.candidate.distanceMiles < a.candidate.distanceMiles ? b : a,
  );
  const nearest = costed.reduce((a, b) =>
    b.candidate.distanceMiles < a.candidate.distanceMiles ? b : a,
  );

  return {
    kind: 'verdict',
    winner: winner.candidate,
    winnerCost: winner.cost,
    nearest: nearest.candidate,
    nearestCost: nearest.cost,
    savings: nearest.cost - winner.cost,
    winnerIsNearest: winner.candidate.station.placeId === nearest.candidate.station.placeId,
    tripType,
  };
}

/** A station known only by straight-line distance — routing hasn't run yet. */
export interface RoutingSeed {
  station: Station;
  straightLineMiles: number;
}

/**
 * Pre-filter before the OpenRouteService fan-out: always keep the nearest
 * station (it anchors the savings baseline), then fill remaining slots with
 * the cheapest stations by posted price for the selected grade. Heuristic —
 * straight-line nearest stands in for driving-distance nearest at this stage.
 */
export function selectRoutingCandidates(
  seeds: RoutingSeed[],
  grade: FuelGrade,
  cap: number = MAX_ROUTING_CANDIDATES,
): RoutingSeed[] {
  if (seeds.length <= cap) return seeds;

  const nearest = seeds.reduce((a, b) => (b.straightLineMiles < a.straightLineMiles ? b : a));
  const byPrice = seeds
    .filter((s) => s !== nearest)
    .sort(
      (a, b) =>
        (a.station.prices[grade]?.price ?? Infinity) - (b.station.prices[grade]?.price ?? Infinity) ||
        a.straightLineMiles - b.straightLineMiles,
    );
  return [nearest, ...byPrice.slice(0, cap - 1)];
}
