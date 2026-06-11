import { vehicleLookups, type VehicleLookups, type VehicleSpec } from '../data/vehicles';
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
 */
export function wireVehiclePicker(
  root: HTMLElement,
  onPick: (vehicle: VehicleSpec | null) => void,
  initial?: VehicleIdentity,
  lookups: VehicleLookups = vehicleLookups,
): void {
  const yearSel = root.querySelector<HTMLSelectElement>('[data-picker="year"]')!;
  const makeSel = root.querySelector<HTMLSelectElement>('[data-picker="make"]')!;
  const modelSel = root.querySelector<HTMLSelectElement>('[data-picker="model"]')!;
  const dieselNotice = root.querySelector<HTMLElement>('[data-picker="diesel-notice"]')!;

  function fill(select: HTMLSelectElement, values: (string | number)[], placeholder: string) {
    select.innerHTML =
      `<option value="" selected disabled>${placeholder}</option>` +
      values.map((v) => `<option value="${v}">${v}</option>`).join('');
    select.disabled = values.length === 0;
  }

  function emit() {
    dieselNotice.classList.add('hidden');
    if (!yearSel.value || !makeSel.value || !modelSel.value) return onPick(null);
    const vehicle = lookups.findVehicle(Number(yearSel.value), makeSel.value, modelSel.value);
    if (!vehicle) return onPick(null);
    if (vehicle.fuelType === 'diesel') {
      dieselNotice.classList.remove('hidden');
      return onPick(null);
    }
    onPick(vehicle);
  }

  fill(yearSel, lookups.years(), 'Year');

  yearSel.addEventListener('change', () => {
    fill(makeSel, lookups.makesFor(Number(yearSel.value)), 'Make');
    fill(modelSel, [], 'Model');
    emit();
  });
  makeSel.addEventListener('change', () => {
    fill(modelSel, lookups.modelsFor(Number(yearSel.value), makeSel.value), 'Model');
    emit();
  });
  modelSel.addEventListener('change', emit);

  if (initial) {
    yearSel.value = String(initial.year);
    fill(makeSel, lookups.makesFor(initial.year), 'Make');
    makeSel.value = initial.make;
    fill(modelSel, lookups.modelsFor(initial.year, initial.make), 'Model');
    modelSel.value = initial.model;
    emit();
  }
}
