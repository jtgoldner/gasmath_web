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

  // Exercises the real lazy path: no injected lookups, module cache cleared, so
  // the full table genuinely has to arrive over a dynamic import.
  it('fills year and make from the bundled index before the full table loads', async () => {
    vi.resetModules();
    const { wireVehiclePicker: wire } = await import('./vehicle-picker');

    const root = mount();
    const onPick = vi.fn();
    wire(root, onPick);

    const yearSel = root.querySelector<HTMLSelectElement>('[data-picker="year"]')!;
    const makeSel = root.querySelector<HTMLSelectElement>('[data-picker="make"]')!;
    const modelSel = root.querySelector<HTMLSelectElement>('[data-picker="model"]')!;

    // Populated on the first frame, with no await — this is the whole point of
    // keeping the index in the main bundle.
    expect(yearSel.options.length).toBeGreaterThan(1);

    pick(root, 'year', '2024');
    expect(makeSel.options.length).toBeGreaterThan(1);
    expect([...makeSel.options].map((o) => o.value)).toContain('Toyota');

    // Models need the lazy chunk; until it lands the select shows a disabled
    // loading state rather than silently dropping the selection.
    pick(root, 'make', 'Toyota');
    expect(modelSel.disabled).toBe(true);
    expect(modelSel.options[0].textContent).toBe('Loading…');

    await vi.waitFor(() => expect(modelSel.options.length).toBeGreaterThan(1));
    expect([...modelSel.options].map((o) => o.value)).toContain('Camry');

    pick(root, 'model', 'Camry');
    await vi.waitFor(() =>
      expect(onPick).toHaveBeenLastCalledWith(
        expect.objectContaining({ year: 2024, make: 'Toyota', model: 'Camry' }),
      ),
    );
  });

  it('ignores a stale model load when the make changes again mid-flight', async () => {
    vi.resetModules();
    const { wireVehiclePicker: wire } = await import('./vehicle-picker');

    const root = mount();
    wire(root, vi.fn());
    const modelSel = root.querySelector<HTMLSelectElement>('[data-picker="model"]')!;

    pick(root, 'year', '2024');
    pick(root, 'make', 'Toyota'); // in flight...
    pick(root, 'make', 'Honda'); // ...superseded before it resolves

    await vi.waitFor(() => expect(modelSel.options.length).toBeGreaterThan(1));
    const models = [...modelSel.options].map((o) => o.value);
    expect(models).toContain('Civic'); // Honda won
    expect(models).not.toContain('Camry'); // stale Toyota fill discarded
  });
});
