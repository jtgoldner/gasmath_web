// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { makeVehicleLookups, type VehicleSpec } from '../data/vehicles';
import { vehiclePickerHtml, wireVehiclePicker } from './vehicle-picker';

// Synthetic dataset: one gasoline and one diesel nameplate. The real EPA-
// derived dataset has no diesel-only nameplates (heavy-duty diesels are exempt
// from EPA reporting), so the diesel gate is exercised here with injected data.
const FIXTURE: VehicleSpec[] = [
  { year: 2024, make: 'Acme', model: 'Gas Wagon', combinedMpg: 30, tankCapacityGal: 14, fuelType: 'gasoline' },
  { year: 2024, make: 'Acme', model: 'Diesel Hauler', combinedMpg: 22, tankCapacityGal: 26, fuelType: 'diesel' },
];

function mount(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = vehiclePickerHtml();
  document.body.appendChild(root);
  return root;
}

function pick(root: HTMLElement, picker: string, value: string): void {
  const sel = root.querySelector<HTMLSelectElement>(`[data-picker="${picker}"]`)!;
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
}

describe('vehicle picker', () => {
  it('emits the chosen gasoline vehicle once the selection is complete', () => {
    const root = mount();
    const onPick = vi.fn();
    wireVehiclePicker(root, onPick, undefined, makeVehicleLookups(FIXTURE));

    pick(root, 'year', '2024');
    pick(root, 'make', 'Acme');
    pick(root, 'model', 'Gas Wagon');

    expect(onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'Gas Wagon', combinedMpg: 30, tankCapacityGal: 14 }),
    );
    expect(root.querySelector('[data-picker="diesel-notice"]')!.classList.contains('hidden')).toBe(true);
  });

  it('gates a diesel vehicle: shows the notice and emits null (PRD §5.1)', () => {
    const root = mount();
    const onPick = vi.fn();
    wireVehiclePicker(root, onPick, undefined, makeVehicleLookups(FIXTURE));

    pick(root, 'year', '2024');
    pick(root, 'make', 'Acme');
    pick(root, 'model', 'Diesel Hauler');

    expect(root.querySelector('[data-picker="diesel-notice"]')!.classList.contains('hidden')).toBe(false);
    expect(onPick).toHaveBeenLastCalledWith(null);
  });
});
