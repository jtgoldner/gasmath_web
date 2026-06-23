import type { LatLng, ProviderDebugMeta } from '../data/provider';
import type { DebugTrace } from '../debug';
import { selectedGrade, type Verdict } from '../engine/engine';
import type { Candidate, FuelGrade } from '../engine/types';
import type { AppSettings } from '../storage';
import { COPY, money } from './copy';
import { debugPanelHtml } from './debug-panel';
import { backButton, headerHtml } from './header';

export interface VerdictProps {
  verdict: Verdict;
  settings: AppSettings;
  onRelaxTopTier: () => void;
  onRelaxStaleness: () => void;
  onBack: () => void;
  /** DEBUG ONLY: present only when ?debug=true (see main.ts). Renders below the cards. */
  debugTrace?: DebugTrace;
  providerDebugMeta?: ProviderDebugMeta | null;
  /** DEBUG ONLY: the ?lat=&?lng= override in effect, if any. */
  debugLocationOverride?: LatLng | null;
}

/**
 * One card per station, used to build the closest-vs-cheapest comparison.
 * "Estimated cost" is the engine's effective cost (gallons needed × price, plus
 * the fuel to drive there), so the two cards' costs differ by exactly the
 * "You'll save …" amount.
 */
function stationCardHtml(opts: {
  label: string;
  candidate: Candidate;
  grade: FuelGrade;
  cost: number;
  best?: boolean;
  badge?: string;
  savings?: number;
}): string {
  const c = COPY.verdict;
  const s = opts.candidate.station;
  const price = s.prices[opts.grade]!.price;
  const address = s.address ? `<p class="station-address">${s.address}</p>` : '';
  const badge = opts.badge ? `<span class="best-badge">${opts.badge}</span>` : '';
  const savingsLine =
    opts.savings !== undefined ? `<p class="savings">${c.saveByDriving(money(opts.savings))}</p>` : '';

  return `
    <section class="verdict-card${opts.best ? ' verdict-card-best' : ''}">
      <div class="verdict-card-head">
        <p class="verdict-label">${opts.label}</p>
        ${badge}
      </div>
      <h2 class="station-name">${s.name}</h2>
      ${address}
      <p class="muted card-detail">${c.distance(opts.candidate.distanceMiles.toFixed(1))}</p>
      <div class="price-row">
        <span class="price-num">${money(price)}</span>
        <span class="price-unit">${c.perGallon(opts.grade)}</span>
      </div>
      <div class="est-cost">
        <span class="est-label">${c.estimatedCost}</span>
        <span class="est-num">${money(opts.cost)}</span>
      </div>
      ${savingsLine}
      <!-- FUTURE(map): insert a small Google Map of this station and a
           "Get Directions" link here. The map MUST be a Google Map (PRD §7).
           Not built yet — placeholder for a later pass. -->
    </section>`;
}

/**
 * Verdict screen. A decided verdict shows a closest-vs-cheapest comparison —
 * two cards that make the cost delta explicit (or one card when they're the
 * same station). This is a single decision framework, not a ranked list
 * (CLAUDE.md hard rule 2 / PRD §5.2). Relaxation offers and dead-ends keep the
 * single-card layout.
 */
export function renderVerdict(root: HTMLElement, props: VerdictProps): void {
  const v = props.verdict;
  const c = COPY.verdict;

  let body: string;
  switch (v.kind) {
    case 'verdict': {
      const grade = selectedGrade(props.settings);
      const cards = v.winnerIsNearest
        ? // Closest is also cheapest — one card, flagged as both.
          stationCardHtml({
            label: c.closestLabel,
            candidate: v.winner,
            grade,
            cost: v.winnerCost,
            best: true,
            badge: c.alsoCheapest,
          })
        : stationCardHtml({
            label: c.closestLabel,
            candidate: v.nearest,
            grade,
            cost: v.nearestCost,
          }) +
          stationCardHtml({
            label: c.cheapestLabel,
            candidate: v.winner,
            grade,
            cost: v.winnerCost,
            best: true,
            badge: c.bestValue,
            savings: v.savings,
          });
      body = `<div class="verdict-cards">${cards}</div>`;
      break;
    }
    case 'offer-relax-top-tier':
      body = `
        <section class="card">
          <p>${c.relaxTopTier}</p>
          <button class="primary" data-act="relax-top-tier">${c.showAll}</button>
        </section>`;
      break;
    case 'offer-relax-staleness':
      body = `
        <section class="card">
          <p>${c.relaxStaleness}</p>
          <button class="primary" data-act="relax-staleness">${c.includeOlder}</button>
        </section>`;
      break;
    case 'no-stations':
      body = `<section class="card"><p>${c.noStations}</p></section>`;
      break;
  }

  // DEBUG ONLY: rendered below the cards, only when main.ts passes a trace
  // (i.e. only when ?debug=true was on the URL). No effect otherwise.
  const debugSection = props.debugTrace
    ? debugPanelHtml(props.debugTrace, props.providerDebugMeta ?? null, props.debugLocationOverride ?? null)
    : '';

  root.innerHTML = `
    <main class="screen">
      ${headerHtml({ left: backButton })}
      ${body}
      ${debugSection}
      <!-- Low-emphasis support link — verdict screen only, not a competing CTA. -->
      <p class="coffee-note">${c.coffeePrefix}<a href="${c.coffeeUrl}" target="_blank" rel="noopener noreferrer">${c.coffeeLink}</a>${c.coffeeSuffix}</p>
      <!-- Legal requirement (hard rule 6, PRD §7): Google attribution must
           accompany Places station/price data. Map-free display requires the
           official "Powered by Google" logo; the asset lives in
           public/attribution/ (see the README there). -->
      <div class="attribution" data-attribution>
        <img class="attribution-logo" data-act="attribution-logo"
             src="/attribution/powered-by-google-on-non-white.png"
             alt="${c.attributionAlt}" height="18">
      </div>
    </main>`;

  // Until the official PNG is dropped in, degrade gracefully to text rather
  // than a broken-image icon.
  root.querySelector('[data-act="attribution-logo"]')?.addEventListener('error', (e) => {
    const img = e.currentTarget as HTMLImageElement;
    const span = document.createElement('span');
    span.className = 'attribution-fallback';
    span.textContent = c.attributionAlt;
    img.replaceWith(span);
  });

  root.querySelector('[data-act="back"]')!.addEventListener('click', props.onBack);
  root.querySelector('[data-act="relax-top-tier"]')?.addEventListener('click', props.onRelaxTopTier);
  root.querySelector('[data-act="relax-staleness"]')?.addEventListener('click', props.onRelaxStaleness);
}
