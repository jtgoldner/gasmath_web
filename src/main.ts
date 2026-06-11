import './style.css';
import { initAnalytics, track } from './analytics';
import { liveProvider } from './data/live-provider';
import { mockProvider } from './data/mock-provider';
import type { LatLng, StationProvider } from './data/provider';
import { decide, type Relaxations } from './engine/engine';
import type { Candidate } from './engine/types';
import {
  isHybridNoticeHidden,
  loadSettings,
  markHybridNoticeSeen,
  saveSettings,
  type AppSettings,
} from './storage';
import { COPY } from './ui/copy';
import { renderHome } from './ui/home';
import { renderHybridInfo } from './ui/hybrid-info';
import { renderOnboarding } from './ui/onboarding';
import { renderSettings } from './ui/settings';
import { renderVerdict } from './ui/verdict';

const app = document.querySelector<HTMLDivElement>('#app')!;

// Dev uses the mock (no keys needed); set VITE_LIVE=1 with `vercel dev` to
// exercise the live proxies locally. Production always uses live data.
const provider: StationProvider =
  import.meta.env.DEV && import.meta.env.VITE_LIVE !== '1' ? mockProvider : liveProvider;

let settings: AppSettings | null = loadSettings();

/** One search session; accepted relaxations re-fetch so new candidates get real routing. */
let session: {
  location: LatLng;
  candidates: Candidate[];
  fraction: number;
  relax: Relaxations;
} | null = null;

// TODO(M3): surface a denied location permission in the UI instead of silently
// falling back — with live data a wrong location means wrong stations.
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

function showLoading(): void {
  app.innerHTML = `<main class="screen center"><p class="muted">${COPY.home.locating}</p></main>`;
}

function showError(): void {
  app.innerHTML = `
    <main class="screen center">
      <section class="card">
        <p>${COPY.errors.fetchFailed}</p>
        <button class="primary" data-act="retry">${COPY.errors.retry}</button>
      </section>
    </main>`;
  app.querySelector('[data-act="retry"]')!.addEventListener('click', showHome);
}

function showOnboarding(): void {
  renderOnboarding(app, (s) => {
    settings = s;
    saveSettings(s);
    track('onboarding_complete');
    showHome();
  });
}

function showHome(): void {
  if (!settings) return showOnboarding();
  renderHome(app, {
    settings,
    onOpenSettings: showSettings,
    onFind: startSearch,
    showHybridNotice: !isHybridNoticeHidden(),
    onOpenHybridInfo: showHybridInfo,
  });
}

function showHybridInfo(): void {
  markHybridNoticeSeen(); // starts the 24h hide window for the home prompt
  renderHybridInfo(app, { onBack: showHome });
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
  showLoading();
  track('search_started');
  const location = await locate();
  try {
    const candidates = await provider.getCandidates(location, settings!, {});
    session = { location, candidates, fraction, relax: {} };
    showVerdict();
  } catch {
    showError();
  }
}

async function acceptRelax(patch: Relaxations): Promise<void> {
  if (!settings || !session) return showHome();
  session.relax = { ...session.relax, ...patch };
  track('relax_accepted', { type: patch.topTier ? 'top_tier' : 'staleness' });
  showLoading();
  try {
    session.candidates = await provider.getCandidates(session.location, settings, session.relax);
    showVerdict();
  } catch {
    showError();
  }
}

function showVerdict(): void {
  if (!settings || !session) return showHome();
  const verdict = decide(session.candidates, settings, session.fraction, new Date(), session.relax);
  // Aggregate, non-identifying: which outcome the user saw, and (when there's a
  // verdict) whether the winner was already the nearest and the dollar savings.
  track('verdict_shown', {
    kind: verdict.kind,
    ...(verdict.kind === 'verdict'
      ? { winner_is_nearest: verdict.winnerIsNearest, savings: Math.round(verdict.savings) }
      : {}),
  });
  renderVerdict(app, {
    verdict,
    settings,
    onRelaxTopTier: () => void acceptRelax({ topTier: true }),
    onRelaxStaleness: () => void acceptRelax({ staleness: true }),
    onBack: showHome,
  });
}

initAnalytics();
settings ? showHome() : showOnboarding();

// Register the service worker for installability + offline app shell.
// Dev is skipped so the SW cache doesn't interfere with hot reload.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW is a progressive enhancement — ignore registration failures */
    });
  });
}
