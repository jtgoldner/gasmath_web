import type { AppSettings } from '../storage';
import { COPY } from './copy';
import { headerHtml, settingsButton } from './header';

export interface HomeProps {
  settings: AppSettings;
  onOpenSettings: () => void;
  onFind: (sliderFraction: number) => void;
  /** Show the "Hybrid Vehicle? Read This First!" prompt (hidden for 24h after a view). */
  showHybridNotice: boolean;
  onOpenHybridInfo: () => void;
}

/**
 * The fuel-need gauge (PRD §5.2): E left, F right, quarter-tank hash marks,
 * continuous values. The fraction is how much gas the user needs, as a share
 * of tank capacity — gallons_needed = fraction × tank (PRD §6).
 */
export function renderHome(root: HTMLElement, props: HomeProps): void {
  const tank = props.settings.vehicle.tankCapacityGal;
  const { year, make, model } = props.settings.vehicleId;

  root.innerHTML = `
    <main class="screen">
      ${headerHtml({ right: settingsButton })}
      <p class="muted vehicle-line">${year} ${make} ${model}</p>
      ${
        props.showHybridNotice
          ? `<button class="notice-banner" data-act="hybrid">${COPY.home.hybridNotice}</button>`
          : ''
      }
      <section class="card gauge-card">
        <h2>${COPY.home.gaugeTitle}</h2>
        <div class="gauge">
          <div class="ticks" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <input data-act="gauge" type="range" min="0" max="1" step="0.005" value="0.5"
                 aria-label="${COPY.home.gaugeTitle}">
          <div class="gauge-labels" aria-hidden="true"><span>${COPY.home.gaugeEmpty}</span><span>${COPY.home.gaugeFull}</span></div>
        </div>
        <p class="muted" data-act="gallons"></p>
      </section>
      <button class="primary" data-act="find">${COPY.home.find}</button>
    </main>`;

  const gauge = root.querySelector<HTMLInputElement>('[data-act="gauge"]')!;
  const gallons = root.querySelector<HTMLElement>('[data-act="gallons"]')!;

  function updateGallons(): void {
    gallons.textContent = COPY.home.gallons((Number(gauge.value) * tank).toFixed(1));
  }
  updateGallons();
  gauge.addEventListener('input', updateGallons);

  root.querySelector('[data-act="settings"]')!.addEventListener('click', props.onOpenSettings);
  root.querySelector('[data-act="hybrid"]')?.addEventListener('click', props.onOpenHybridInfo);
  root.querySelector('[data-act="find"]')!.addEventListener('click', () => {
    props.onFind(Number(gauge.value));
  });
}
