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

const HYBRID_NOTICE_KEY = 'gasmath.hybridNoticeSeenAt.v1';
const HYBRID_NOTICE_HIDE_MS = 24 * 3_600_000;

/** Record that the user opened the hybrid notice, starting the 24h hide window. */
export function markHybridNoticeSeen(now: Date = new Date()): void {
  localStorage.setItem(HYBRID_NOTICE_KEY, String(now.getTime()));
}

/** True while the home-screen hybrid prompt should stay hidden (within 24h of last view). */
export function isHybridNoticeHidden(now: Date = new Date()): boolean {
  const seen = Number(localStorage.getItem(HYBRID_NOTICE_KEY));
  if (!Number.isFinite(seen) || seen === 0) return false;
  return now.getTime() - seen < HYBRID_NOTICE_HIDE_MS;
}
