import type { Relaxations } from '../engine/engine';
import type { Candidate, ClubBrand } from '../engine/types';
import type { AppSettings } from '../storage';

export interface LatLng {
  lat: number;
  lng: number;
}

/** One real query GasMath issued against a place-search API, for the debug panel. */
export interface DebugQueryInfo {
  /** What was searched (e.g. "Nearby Search: gas_station" or a club brand query text). */
  description: string;
  radiusMeters: number;
  /** Google's two location-filter modes: restriction is a hard cutoff, bias is not. */
  mode: 'locationRestriction' | 'locationBias';
  /** Raw places Google returned for this query, before any GasMath filtering. */
  rawResultCount: number;
  /** How many of those survived with a usable regular/premium price. */
  usableCount: number;
  /** Members-only supplemental queries only: raw place names, exactly as returned. */
  rawPlaceNames?: string[];
  /** Set when the upstream query failed (non-2xx) and degraded to zero results. */
  upstreamStatus?: number;
  /** Upstream error body (truncated) — why the query was rejected, not just that it was. */
  upstreamError?: string;
}

/**
 * A place Places returned that never reached the candidate set — dropped at the
 * proxy for lack of usable price data. Distinct from a candidate the engine
 * excluded: these never got far enough to be excluded.
 *
 * Display-only. Feeds the debug panel and the verdict screen's members-only
 * "no price data" note; never eligible to be ranked or recommended.
 */
export interface DroppedStation {
  name: string;
  address?: string;
  club: ClubBrand | null;
  /** Straight-line estimate; null when Places returned no location for the place. */
  distanceMiles: number | null;
  reason: string;
}

/** Diagnostic snapshot of the last getCandidates() call — debug panel only, never used by logic. */
export interface ProviderDebugMeta {
  queries: DebugQueryInfo[];
  /** Places results dropped before the candidate set was built. */
  droppedStations: DroppedStation[];
  /** How distances were obtained: real routing vs. estimate, and the routing cap. */
  routingDescription: string;
  maxRoutingCandidates: number;
  routedCount: number;
  estimatedCount: number;
}

/**
 * Station data source: the deterministic mock for development, the live
 * provider (Places proxy + OpenRouteService routing) in production.
 * Providers return raw candidates — eligibility filtering belongs to the
 * engine — but the live provider uses `relax` to decide which candidates are
 * worth real routing, so accepting a relaxation offer must re-fetch.
 */
export interface StationProvider {
  getCandidates(
    location: LatLng,
    settings: AppSettings,
    relax?: Relaxations,
    debug?: boolean,
  ): Promise<Candidate[]>;
  /** Debug-only: diagnostics from the most recent getCandidates() call, if debug was requested. */
  getDebugMeta?(): ProviderDebugMeta | null;
  /**
   * Display-only: places from the most recent getCandidates() call that were
   * dropped for lack of price data. Never routed, never ranked.
   */
  getDroppedStations?(): DroppedStation[];
}
