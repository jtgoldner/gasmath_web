import type { ClubBrand } from '../engine/types';
import type { AppSettings } from '../storage';
import type { VehicleSpec } from '../data/vehicles';
import { COPY } from './copy';
import { headerHtml } from './header';
import { vehiclePickerHtml, wireVehiclePicker } from './vehicle-picker';

/** PRD §5.1 order: vehicle → warehouse clubs → Top Tier (ON) → octane (OFF). */
const STEPS = ['vehicle', 'clubs', 'topTier', 'octane'] as const;

export function renderOnboarding(
  root: HTMLElement,
  onComplete: (settings: AppSettings) => void,
): void {
  let step = 0;
  const draft = {
    vehicle: null as VehicleSpec | null,
    clubs: new Set<ClubBrand>(),
    topTierOnly: true,
    preferPremium: false,
  };

  const o = COPY.onboarding;

  const bodies: Record<(typeof STEPS)[number], () => string> = {
    vehicle: () => `
      <h2>${o.vehicleTitle}</h2>
      <p class="muted">${o.vehicleHint}</p>
      ${vehiclePickerHtml()}`,
    clubs: () => `
      <h2>${o.clubsTitle}</h2>
      <p class="muted">${o.clubsHint}</p>
      <label class="row"><input type="checkbox" data-club="costco" ${draft.clubs.has('costco') ? 'checked' : ''}> ${o.costcoLabel}</label>
      <label class="row"><input type="checkbox" data-club="bjs" ${draft.clubs.has('bjs') ? 'checked' : ''}> ${o.bjsLabel}</label>
      <label class="row"><input type="checkbox" data-club="samsclub" ${draft.clubs.has('samsclub') ? 'checked' : ''}> ${o.samsclubLabel}</label>`,
    topTier: () => `
      <h2>${o.topTierTitle}</h2>
      <p class="muted">${o.topTierHint}</p>
      <label class="row"><input type="checkbox" data-pref="topTier" ${draft.topTierOnly ? 'checked' : ''}> ${o.topTierLabel}</label>`,
    octane: () => `
      <h2>${o.octaneTitle}</h2>
      <p class="muted">${o.octaneHint}</p>
      <label class="row"><input type="checkbox" data-pref="octane" ${draft.preferPremium ? 'checked' : ''}> ${o.octaneLabel}</label>`,
  };

  function show(): void {
    const name = STEPS[step];
    const last = step === STEPS.length - 1;
    root.innerHTML = `
      <main class="screen">
        ${headerHtml()}
        <p class="muted">${COPY.tagline}</p>
        <section class="card">${bodies[name]()}</section>
        <div class="nav">
          ${step > 0 ? `<button class="ghost" data-nav="back">${o.back}</button>` : '<span></span>'}
          <button class="primary" data-nav="next" ${name === 'vehicle' && !draft.vehicle ? 'disabled' : ''}>
            ${last ? o.finish : o.next}
          </button>
        </div>
      </main>`;

    const next = root.querySelector<HTMLButtonElement>('[data-nav="next"]')!;

    if (name === 'vehicle') {
      wireVehiclePicker(
        root,
        (v) => {
          draft.vehicle = v;
          next.disabled = v === null;
        },
        draft.vehicle
          ? { year: draft.vehicle.year, make: draft.vehicle.make, model: draft.vehicle.model }
          : undefined,
      );
    }
    root.querySelectorAll<HTMLInputElement>('[data-club]').forEach((box) =>
      box.addEventListener('change', () => {
        const club = box.dataset.club as ClubBrand;
        box.checked ? draft.clubs.add(club) : draft.clubs.delete(club);
      }),
    );
    root.querySelector<HTMLInputElement>('[data-pref="topTier"]')?.addEventListener('change', (e) => {
      draft.topTierOnly = (e.target as HTMLInputElement).checked;
    });
    root.querySelector<HTMLInputElement>('[data-pref="octane"]')?.addEventListener('change', (e) => {
      draft.preferPremium = (e.target as HTMLInputElement).checked;
    });

    root.querySelector('[data-nav="back"]')?.addEventListener('click', () => {
      step -= 1;
      show();
    });
    next.addEventListener('click', () => {
      if (!last) {
        step += 1;
        show();
        return;
      }
      const v = draft.vehicle!;
      onComplete({
        vehicleId: { year: v.year, make: v.make, model: v.model },
        vehicle: { combinedMpg: v.combinedMpg, tankCapacityGal: v.tankCapacityGal },
        clubMemberships: [...draft.clubs],
        topTierOnly: draft.topTierOnly,
        preferPremium: draft.preferPremium,
      });
    });
  }

  show();
}
