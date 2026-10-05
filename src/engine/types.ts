/** Midgrade and diesel are deliberately out of MVP scope (PRD §5.1). */
export type FuelGrade = 'regular' | 'premium';

/** Warehouse club brands subject to the membership filter (CLAUDE.md hard rule 3). */
export type ClubBrand = 'costco' | 'bjs' | 'samsclub';

export interface PriceQuote {
  /** USD per gallon. */
  price: number;
  updatedAt: Date;
}

export interface Station {
  placeId: string;
  name: string;
  /** Full street address from Places (formattedAddress); shown on the verdict screen. */
  address?: string;
  /** Normalized brand (e.g. "Shell"); drives Top Tier and club matching in the data layer. */
  brand: string;
  /** Set when the station belongs to a warehouse club; null otherwise. */
  club: ClubBrand | null;
  isTopTier: boolean;
  prices: Partial<Record<FuelGrade, PriceQuote>>;
}

/**
 * Whether the trip back counts toward the detour (PRD §5.2c). Chosen per
 * calculation on the fuel-amount screen — it is not a setting.
 *  - round_trip: coming back to where they started, so the detour is there AND back.
 *  - one_way: going on elsewhere, so only the leg to the station is extra.
 */
export type TripType = 'round_trip' | 'one_way';

/** A station plus the routing facts needed to cost it (PRD §6). */
export interface Candidate {
  station: Station;
  /**
   * One-way driving distance from the user, in miles. Defines "nearest" and
   * breaks ties. The detour the engine costs is this × the trip multiplier
   * (see `detourMiles` in engine.ts) — there is deliberately no precomputed
   * detour field, so the trip type has exactly one place to apply.
   */
  distanceMiles: number;
  /**
   * DEBUG ONLY (not used by engine logic): where distanceMiles came from.
   * 'routed' = real OpenRouteService driving distance; 'estimated' = haversine
   * straight-line × circuity factor (never backs a verdict, only relax offers);
   * 'mock' = deterministic dev data. Optional and ignored everywhere except
   * the debug panel.
   */
  distanceSource?: 'routed' | 'estimated' | 'mock';
}

export interface VehicleProfile {
  combinedMpg: number;
  tankCapacityGal: number;
}

export interface UserSettings {
  vehicle: VehicleProfile;
  /** Clubs the user belongs to. Non-member club stations are removed outright — never shown. */
  clubMemberships: ClubBrand[];
  /** Default ON (PRD §5.1). */
  topTierOnly: boolean;
  /** OFF → price against regular; ON → price against premium (PRD §5.1). */
  preferPremium: boolean;
}
