import './style.css';
import { mockProvider } from './data/mock-provider';
import type { LatLng } from './data/provider';
import { decide, type Relaxations } from './engine/engine';
import type { Candidate } from './engine/types';
import { loadSettings, saveSettings, type AppSettings } from './storage';
import { COPY } from './ui/copy';
import { renderHome } from './ui/home';
import { renderOnboarding } from './ui/onboarding';
import { renderSettings } from './ui/settings';
import { renderVerdict } from './ui/verdict';

const app = document.querySelector<HTMLDivElement>('#app')!;

// Swapped for the live provider (Places proxy + ORS) in Milestone 3.
const provider = mockProvider;

let settings: AppSettings | null = loadSettings();

/** One search = one candidate set; relaxations the user accepts re-decide over it. */
let session: { candidates: Candidate[]; fraction: number; relax: Relaxations } | null = null;

// TODO(M3): the live flow must surface a denied location permission instead of
// silently falling back — the mock provider ignores location entirely.
const FALLBACK_LOCATION: LatLng = { lat: 40.7128, lng: -74.006 };

function locate(): Promise<LatLng> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(FALLBACK_LOCATION);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(FALLBACK_LOCATION),
      { timeout: 8_000 },
    );
  });
}

function showOnboarding(): void {
  renderOnboarding(app, (s) => {
    settings = s;
    saveSettings(s);
    showHome();
  });
}

function showHome(): void {
  if (!settings) return showOnboarding();
  renderHome(app, {
    settings,
    onOpenSettings: showSettings,
    onFind: startSearch,
  });
}

function showSettings(): void {
  if (!settings) return showOnboarding();
  renderSettings(app, {
    settings,
    onChange: (s) => {
      settings = s;
      saveSettings(s); // persists immediately (PRD §5.3)
    },
    onBack: showHome,
  });
}

async function startSearch(fraction: number): Promise<void> {
  app.innerHTML = `<main class="screen center"><p class="muted">${COPY.home.locating}</p></main>`;
  const location = await locate();
  const candidates = await provider.getCandidates(location, settings!);
  session = { candidates, fraction, relax: {} };
  showVerdict();
}

function showVerdict(): void {
  if (!settings || !session) return showHome();
  const verdict = decide(session.candidates, settings, session.fraction, new Date(), session.relax);
  renderVerdict(app, {
    verdict,
    settings,
    onRelaxTopTier: () => {
      session!.relax = { ...session!.relax, topTier: true };
      showVerdict();
    },
    onRelaxStaleness: () => {
      session!.relax = { ...session!.relax, staleness: true };
      showVerdict();
    },
    onBack: showHome,
  });
}

settings ? showHome() : showOnboarding();
