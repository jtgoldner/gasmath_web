import type { Candidate } from '../engine/types';
import type { AppSettings } from '../storage';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Station data source. Milestone 2 ships the deterministic mock; Milestone 3
 * adds the live provider (Places proxy + OpenRouteService routing) behind this
 * same interface, including the members-only supplemental club-brand query.
 * Providers return raw candidates — eligibility filtering belongs to the engine.
 */
export interface StationProvider {
  getCandidates(location: LatLng, settings: AppSettings): Promise<Candidate[]>;
}
