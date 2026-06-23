import type { Relaxations } from '../engine/engine';
import type { Candidate } from '../engine/types';
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
}

/** Diagnostic snapshot of the last getCandidates() call — debug panel only, never used by logic. */
export interface ProviderDebugMeta {
  queries: DebugQueryInfo[];
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
}
