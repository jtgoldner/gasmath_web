import type { ClubBrand } from '../engine/types';
import type { AppSettings } from '../storage';
import { COPY } from './copy';
import { vehiclePickerHtml, wireVehiclePicker } from './vehicle-picker';

export interface SettingsProps {
  settings: AppSettings;
  /** Called with the full updated settings on every change — persists immediately (PRD §5.3). */
  onChange: (settings: AppSettings) => void;
  onBack: () => void;
}

export function renderSettings(root: HTMLElement, props: SettingsProps): void {
  const s = props.settings;
  const o = COPY.onboarding;
  // Tracks edits across multiple changes within one visit to this screen.
  let current = s;

  function apply(patch: Partial<AppSettings>): void {
    current = { ...current, ...patch };
    props.onChange(current);
  }

  root.innerHTML = `
    <main class="screen">
      <header class="topbar">
        <h1>${COPY.settings.title}</h1>
        <button class="ghost" data-act="back">${COPY.settings.done}</button>
      </header>
      <section class="card">
        <h2>${COPY.settings.vehicle}</h2>
        ${vehiclePickerHtml()}
      </section>
      <section class="card">
        <h2>${COPY.settings.clubs}</h2>
        <label class="row"><input type="checkbox" data-club="costco" ${s.clubMemberships.includes('costco') ? 'checked' : ''}> ${o.costcoLabel}</label>
        <label class="row"><input type="checkbox" data-club="bjs" ${s.clubMemberships.includes('bjs') ? 'checked' : ''}> ${o.bjsLabel}</label>
      </section>
      <section class="card">
        <h2>${COPY.settings.preferences}</h2>
        <label class="row"><input type="checkbox" data-pref="topTier" ${s.topTierOnly ? 'checked' : ''}> ${o.topTierLabel}</label>
        <label class="row"><input type="checkbox" data-pref="octane" ${s.preferPremium ? 'checked' : ''}> ${o.octaneLabel}</label>
      </section>
    </main>`;

  // Vehicle changes apply only once a complete, gasoline vehicle is picked;
  // an in-progress or diesel selection leaves the saved vehicle untouched.
  wireVehiclePicker(
    root,
    (v) => {
      if (!v) return;
      apply({
        vehicleId: { year: v.year, make: v.make, model: v.model },
        vehicle: { combinedMpg: v.combinedMpg, tankCapacityGal: v.tankCapacityGal },
      });
    },
    s.vehicleId,
  );

  root.querySelectorAll<HTMLInputElement>('[data-club]').forEach((box) =>
    box.addEventListener('change', () => {
      const club = box.dataset.club as ClubBrand;
      const memberships = new Set(current.clubMemberships);
      box.checked ? memberships.add(club) : memberships.delete(club);
      apply({ clubMemberships: [...memberships] });
    }),
  );
  root.querySelector<HTMLInputElement>('[data-pref="topTier"]')!.addEventListener('change', (e) => {
    apply({ topTierOnly: (e.target as HTMLInputElement).checked });
  });
  root.querySelector<HTMLInputElement>('[data-pref="octane"]')!.addEventListener('change', (e) => {
    apply({ preferPremium: (e.target as HTMLInputElement).checked });
  });

  root.querySelector('[data-act="back"]')!.addEventListener('click', props.onBack);
}
