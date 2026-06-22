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

// Pump body extent in the SVG viewBox (0..64). The amber fill rises within this
// band; the draggable track overlays exactly this band (see .pump-track in CSS).
const BODY_TOP = 14;
const BODY_BOTTOM = 56;
const BODY_HEIGHT = BODY_BOTTOM - BODY_TOP; // 42

// The gauge floors here — the bottom of the range is 0.1 gallons, never 0,
// so the "Find" CTA is always actionable.
const MIN_GALLONS = 0.1;

/**
 * Vertical pump-fill gauge (PRD §5.2). The fraction is how much gas the user
 * needs as a share of tank capacity — gallons_needed = fraction × tank (§6).
 * A visually-hidden range input is the value source of truth (keyboard + a11y);
 * pointer drag on the pump and the SVG fill mirror it. The pump silhouette
 * reuses the loader's geometry (src/ui/loader.ts).
 */
export function renderHome(root: HTMLElement, props: HomeProps): void {
  const tank = props.settings.vehicle.tankCapacityGal;
  const minFraction = MIN_GALLONS / tank; // fraction that yields the 0.1 gal floor
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
        <div class="pump-gauge">
          <div class="pump-column">
            <span class="pump-label">${COPY.home.gaugeFull}</span>
            <div class="pump-stage">
              <svg class="pump-svg-gauge" viewBox="8 0 48 64" width="130" aria-hidden="true">
                <defs>
                  <clipPath id="pumpFillClip">
                    <rect x="13" y="14" width="24" height="42" rx="3"/>
                    <rect x="45" y="39" width="8" height="6" rx="1.5"/>
                  </clipPath>
                </defs>
                <!-- Amber fill rises from the body bottom to the boundary, clipped to the silhouette. -->
                <rect data-act="pump-fill" x="10" y="35" width="46" height="21"
                      fill="var(--accent)" clip-path="url(#pumpFillClip)"/>
                <!-- Gray silhouette outline (same geometry as the loader pump). -->
                <g fill="none" stroke="var(--muted)" stroke-width="2.5">
                  <rect x="13" y="14" width="24" height="42" rx="3"/>
                  <path d="M37 24 H45 a3 3 0 0 1 3 3 V40" stroke-linecap="round"/>
                  <rect x="45" y="39" width="8" height="6" rx="1.5"/>
                </g>
                <rect x="10" y="56" width="30" height="3" rx="1.5" fill="var(--muted)"/>
                <!-- Quarter-tank ticks: 75% / 50% / 25% of the draggable range. -->
                <g stroke="var(--muted)" stroke-width="1" opacity="0.8">
                  <line x1="8.5" y1="24.5" x2="12" y2="24.5"/>
                  <line x1="8.5" y1="35" x2="12" y2="35"/>
                  <line x1="8.5" y1="45.5" x2="12" y2="45.5"/>
                </g>
                <!-- Drag handle at the fill boundary. -->
                <line data-act="pump-handle" x1="11" y1="35" x2="39" y2="35"
                      stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
              <div class="pump-track" data-act="gauge-track" aria-hidden="true"></div>
            </div>
            <span class="pump-label">${COPY.home.gaugeEmpty}</span>
          </div>
          <div class="pump-readout">
            <span class="pump-gallons" data-act="gallons"></span>
            <span class="pump-gallons-label">${COPY.home.gallonsLabel}</span>
          </div>
        </div>
        <input class="pump-input" data-act="gauge" type="range" min="0" max="1" step="0.005" value="0.5"
               aria-label="${COPY.home.gaugeTitle}">
      </section>
      <button class="primary" data-act="find">${COPY.home.find}</button>
    </main>`;

  const gauge = root.querySelector<HTMLInputElement>('[data-act="gauge"]')!;
  const track = root.querySelector<HTMLElement>('[data-act="gauge-track"]')!;
  const fill = root.querySelector<SVGRectElement>('[data-act="pump-fill"]')!;
  const handle = root.querySelector<SVGLineElement>('[data-act="pump-handle"]')!;
  const gallons = root.querySelector<HTMLElement>('[data-act="gallons"]')!;
  const findBtn = root.querySelector<HTMLButtonElement>('[data-act="find"]')!;

  // Mirror the input value into the SVG fill + handle + gallons readout. The
  // value is floored at MIN_GALLONS by the input handler below, so gallons is
  // always > 0; findBtn.disabled stays as a defensive invariant (never true now).
  function paint(): void {
    const fraction = Number(gauge.value);
    const boundary = BODY_TOP + (1 - fraction) * BODY_HEIGHT;
    fill.setAttribute('y', String(boundary));
    fill.setAttribute('height', String(Math.max(0, BODY_BOTTOM - boundary)));
    handle.setAttribute('y1', String(boundary));
    handle.setAttribute('y2', String(boundary));
    gallons.textContent = (fraction * tank).toFixed(1);
    findBtn.disabled = !(fraction > 0);
  }
  paint();
  gauge.addEventListener('input', () => {
    // Floor the value so the gauge never sits below 0.1 gallons (drag + keyboard).
    if (Number(gauge.value) < minFraction) gauge.value = String(minFraction);
    paint();
  });

  // Continuous drag (mouse + touch via pointer events): vertical position over
  // the track maps to fraction — top = full, bottom = empty.
  function setFromClientY(clientY: number): void {
    const rect = track.getBoundingClientRect();
    if (rect.height === 0) return;
    const fraction = Math.min(1, Math.max(minFraction, (rect.bottom - clientY) / rect.height));
    gauge.value = String(fraction);
    gauge.dispatchEvent(new Event('input', { bubbles: true }));
  }
  let dragging = false;
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    setFromClientY(e.clientY);
    e.preventDefault();
  });
  track.addEventListener('pointermove', (e) => {
    if (dragging) setFromClientY(e.clientY);
  });
  const endDrag = (): void => {
    dragging = false;
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  root.querySelector('[data-act="settings"]')!.addEventListener('click', props.onOpenSettings);
  root.querySelector('[data-act="hybrid"]')?.addEventListener('click', props.onOpenHybridInfo);
  findBtn.addEventListener('click', () => {
    // Guard in addition to the disabled attribute — zero gallons never proceeds.
    if (Number(gauge.value) > 0) props.onFind(Number(gauge.value));
  });
}
