import {
  loadVehicleLookups,
  loadedVehicleLookups,
  vehicleIndex,
  type VehicleLookups,
  type VehicleSpec,
} from '../data/vehicles';
import type { VehicleIdentity } from '../storage';
import { COPY } from './copy';

/** Cascading year → make → model selects, shared by onboarding and settings. */

export function vehiclePickerHtml(): string {
  return `
    <div class="picker">
      <label>Year
        <select data-picker="year"><option value="" selected disabled>Year</option></select>
      </label>
      <label>Make
        <select data-picker="make" disabled><option value="" selected disabled>Make</option></select>
      </label>
      <label>Model
        <select data-picker="model" disabled><option value="" selected disabled>Model</option></select>
      </label>
      <p class="notice hidden" data-picker="diesel-notice">${COPY.onboarding.dieselNotice}</p>
    </div>`;
}

/**
 * Wires the cascading selects. `onPick` fires with the chosen gasoline vehicle,
 * or null while the selection is incomplete or diesel (PRD §5.1 diesel gate).
 *
 * Year and make come from the small bundled index, so they populate on the
 * first frame. Only the model select and the final lookup need the full table,
 * which is fetched as a separate chunk the moment the picker is wired — long
 * before a user can realistically get through two selects. If they beat it,
 * the model select shows a brief loading state rather than dropping the pick.
 *
 * Passing `lookups` (tests, or any preloaded table) skips the async path
 * entirely and behaves exactly as the fully synchronous picker always has.
 */
export function wireVehiclePicker(
  root: HTMLElement,
  onPick: (vehicle: VehicleSpec | null) => void,
  initial?: VehicleIdentity,
  lookups?: VehicleLookups,
): void {
  const yearSel = root.querySelector<HTMLSelectElement>('[data-picker="year"]')!;
  const makeSel = root.querySelector<HTMLSelectElement>('[data-picker="make"]')!;
  const modelSel = root.querySelector<HTMLSelectElement>('[data-picker="model"]')!;
  const dieselNotice = root.querySelector<HTMLElement>('[data-picker="diesel-notice"]')!;

  // Synchronous whenever the table is injected or already cached from an
  // earlier visit this session; otherwise resolved once the chunk lands.
  let full: VehicleLookups | null = lookups ?? loadedVehicleLookups();
  const fullReady: Promise<VehicleLookups> = full
    ? Promise.resolve(full)
    : loadVehicleLookups().then((l) => (full = l));

  // Year/make read from the full table when we have it so injected fixtures
  // stay authoritative; otherwise from the bundled index.
  const years = () => (full ? full.years() : vehicleIndex.years());
  const makesFor = (year: number) => (full ? full.makesFor(year) : vehicleIndex.makesFor(year));

  // Guards against a slow chunk resolving after the user has moved on to a
  // different make — only the newest request may write to the model select.
  let pendingToken = 0;

  function fill(select: HTMLSelectElement, values: (string | number)[], placeholder: string) {
    select.innerHTML =
      `<option value="" selected disabled>${placeholder}</option>` +
      values.map((v) => `<option value="${v}">${v}</option>`).join('');
    select.disabled = values.length === 0;
  }

  function emitWith(lk: VehicleLookups) {
    const vehicle = lk.findVehicle(Number(yearSel.value), makeSel.value, modelSel.value);
    if (!vehicle) return onPick(null);
    if (vehicle.fuelType === 'diesel') {
      dieselNotice.classList.remove('hidden');
      return onPick(null);
    }
    onPick(vehicle);
  }

  function emit() {
    dieselNotice.classList.add('hidden');
    if (!yearSel.value || !makeSel.value || !modelSel.value) return onPick(null);
    if (full) return emitWith(full);
    void fullReady.then(emitWith);
  }

  /** Populate models for the current year/make, waiting on the table if needed. */
  function fillModels(year: number, make: string, then?: (lk: VehicleLookups) => void) {
    const token = ++pendingToken;
    if (full) {
      fill(modelSel, full.modelsFor(year, make), 'Model');
      then?.(full);
      return;
    }
    fill(modelSel, [], COPY.onboarding.loadingModels);
    void fullReady.then((lk) => {
      if (token !== pendingToken) return; // superseded by a newer selection
      fill(modelSel, lk.modelsFor(year, make), 'Model');
      then?.(lk);
    });
  }

  fill(yearSel, years(), 'Year');

  yearSel.addEventListener('change', () => {
    fill(makeSel, makesFor(Number(yearSel.value)), 'Make');
    fill(modelSel, [], 'Model');
    pendingToken++; // any in-flight model fill is now stale
    emit();
  });
  makeSel.addEventListener('change', () => {
    // No model is selected yet either way, so emit once now (reporting the
    // incomplete selection) exactly as the synchronous picker did.
    fillModels(Number(yearSel.value), makeSel.value);
    emit();
  });
  modelSel.addEventListener('change', emit);

  if (initial) {
    yearSel.value = String(initial.year);
    fill(makeSel, makesFor(initial.year), 'Make');
    makeSel.value = initial.make;
    fillModels(initial.year, initial.make, () => {
      modelSel.value = initial.model;
      emit();
    });
  }
}
