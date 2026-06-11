import type { Relaxations } from '../engine/engine';
import type { Candidate } from '../engine/types';
import type { AppSettings } from '../storage';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Station data source: the deterministic mock for development, the live
 * provider (Places proxy + OpenRouteService routing) in production.
 * Providers return raw candidates — eligibility filtering belongs to the
 * engine — but the live provider uses `relax` to decide which candidates are
 * worth real routing, so accepting a relaxation offer must re-fetch.
 */
export interface StationProvider {
  getCandidates(location: LatLng, settings: AppSettings, relax?: Relaxations): Promise<Candidate[]>;
}
