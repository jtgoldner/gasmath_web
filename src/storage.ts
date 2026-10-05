import { DEFAULT_TRIP_TYPE } from './engine/engine';
import type { TripType, UserSettings } from './engine/types';

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

const LAST_TRIP_TYPE_KEY = 'gasmath.lastTripType.v1';
const TRIP_TYPES: readonly TripType[] = ['round_trip', 'one_way'];

/**
 * The trip type used for the user's most recent calculation — the initial state
 * of the fuel-amount screen's Round trip / One way control (PRD §5.2c). This is
 * a convenience default, NOT a setting: it is never shown in Settings, and a
 * fresh browser (or an unrecognised stored value) falls back to round trip.
 */
export function loadLastTripType(): TripType {
  try {
    const raw = localStorage.getItem(LAST_TRIP_TYPE_KEY);
    return TRIP_TYPES.includes(raw as TripType) ? (raw as TripType) : DEFAULT_TRIP_TYPE;
  } catch {
    return DEFAULT_TRIP_TYPE; // storage blocked → just use the default
  }
}

/** Remember the trip type of the calculation being run. Never throws: losing a convenience default must not abort a search. */
export function saveLastTripType(tripType: TripType): void {
  try {
    localStorage.setItem(LAST_TRIP_TYPE_KEY, tripType);
  } catch {
    /* storage blocked or full — the default is a nicety, not worth failing for */
  }
}

const NJ_BANNER_DISMISSED_KEY = 'gasmath.njSelfServeBannerDismissed.v1';

/** One-time NJ self-serve gas law banner — true once the user has dismissed it. */
export function isNjBannerDismissed(): boolean {
  return localStorage.getItem(NJ_BANNER_DISMISSED_KEY) === '1';
}

export function dismissNjBanner(): void {
  localStorage.setItem(NJ_BANNER_DISMISSED_KEY, '1');
}
