import { describe, expect, it } from 'vitest';
import { loadVehicleLookups, vehicleIndex } from './vehicles';

/**
 * The bundled index is a build-time projection of vehicles.json (both written
 * by scripts/build-vehicles.mjs). If someone regenerates one without the other,
 * the picker would offer years or makes the full table can't satisfy — a
 * failure that would only show up as an empty dropdown in the UI. Catch it here.
 */
describe('vehicles-index.json agrees with vehicles.json', () => {
  it('lists exactly the same years, in the same order', async () => {
    const full = await loadVehicleLookups();
    expect(vehicleIndex.years()).toEqual(full.years());
  });

  it('lists exactly the same makes for every year', async () => {
    const full = await loadVehicleLookups();
    for (const year of full.years()) {
      expect(vehicleIndex.makesFor(year)).toEqual(full.makesFor(year));
    }
  });

  it('returns an empty make list for a year that is not in the dataset', () => {
    expect(vehicleIndex.makesFor(1985)).toEqual([]);
  });
});

describe('loadVehicleLookups', () => {
  it('caches, returning the same instance on repeat calls', async () => {
    const a = await loadVehicleLookups();
    const b = await loadVehicleLookups();
    expect(a).toBe(b);
  });

  it('resolves real vehicle data', async () => {
    const full = await loadVehicleLookups();
    const camry = full.findVehicle(2024, 'Toyota', 'Camry');
    expect(camry).toBeDefined();
    expect(camry!.combinedMpg).toBeGreaterThan(0);
    expect(camry!.tankCapacityGal).toBeGreaterThan(0);
  });
});
