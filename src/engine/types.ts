/** Midgrade and diesel are deliberately out of MVP scope (PRD §5.1). */
export type FuelGrade = 'regular' | 'premium';

/** Warehouse club brands subject to the membership filter (CLAUDE.md hard rule 3). */
export type ClubBrand = 'costco' | 'bjs';

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

/** A station plus the routing facts needed to cost it (PRD §6). */
export interface Candidate {
  station: Station;
  /** One-way driving distance from the user, in miles. Defines "nearest" and breaks ties. */
  distanceMiles: number;
  /**
   * Extra round-trip miles driven to use this station. MVP has no destination
   * input, so the data layer sets this to 2 × distanceMiles (there and back).
   */
  roundTripExtraMiles: number;
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
