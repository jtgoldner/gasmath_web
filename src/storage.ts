import type { UserSettings } from './engine/types';

/** Identifies the chosen vehicle for display; MPG/tank live in `vehicle`. */
export interface VehicleIdentity {
  year: number;
  make: string;
  model: string;
}

/**
 * Everything GasMath knows about the user. Hard rule 1: this lives in
 * localStorage only — never on a server, never in analytics payloads.
 */
export interface AppSettings extends UserSettings {
  vehicleId: VehicleIdentity;
}

const KEY = 'gasmath.settings.v1';

export function loadSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppSettings) : null;
  } catch {
    return null; // corrupted storage → treat as first run
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
