import { selectedGrade, type Verdict } from '../engine/engine';
import type { AppSettings } from '../storage';
import { COPY, money } from './copy';

export interface VerdictProps {
  verdict: Verdict;
  settings: AppSettings;
  onRelaxTopTier: () => void;
  onRelaxStaleness: () => void;
  onBack: () => void;
}

/** One verdict, never a list (hard rule 2). Offers and dead-ends share this screen. */
export function renderVerdict(root: HTMLElement, props: VerdictProps): void {
  const v = props.verdict;
  const c = COPY.verdict;

  let body: string;
  switch (v.kind) {
    case 'verdict': {
      const grade = selectedGrade(props.settings);
      const price = v.winner.station.prices[grade]!.price;
      const savingsLine = v.winnerIsNearest
        ? `<p class="savings">${c.affirm}</p>`
        : `<p class="savings">${c.savings(v.winner.station.name, money(v.savings))}</p>`;
      body = `
        <section class="card">
          <p class="muted">${c.heading}</p>
          <h2>${v.winner.station.name}</h2>
          <p>${c.perGallon(money(price), grade)} · ${c.distance(v.winner.distanceMiles.toFixed(1))}</p>
          ${savingsLine}
          <p class="muted">${c.fillCost(money(v.winnerCost))}</p>
        </section>`;
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

  root.innerHTML = `
    <main class="screen">
      <header class="topbar">
        <button class="ghost" data-act="back">← ${c.back}</button>
      </header>
      ${body}
      <!-- Legal requirement (hard rule 6, PRD §7): Google attribution must
           accompany Places station/price data. Map-free display requires the
           official "Powered by Google" logo; the asset lives in
           public/attribution/ (see the README there). -->
      <div class="attribution" data-attribution>
        <img class="attribution-logo" data-act="attribution-logo"
             src="/attribution/powered-by-google-on-white.png"
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
