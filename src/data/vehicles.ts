import indexData from './vehicles-index.json';

export type FuelType = 'gasoline' | 'diesel';

export interface VehicleSpec {
  year: number;
  make: string;
  model: string;
  combinedMpg: number;
  tankCapacityGal: number;
  fuelType: FuelType;
}

export interface VehicleLookups {
  years(): number[];
  makesFor(year: number): string[];
  modelsFor(year: number, make: string): string[];
  findVehicle(year: number, make: string, model: string): VehicleSpec | undefined;
}

/** Build the cascading year → make → model lookups over a vehicle list. */
export function makeVehicleLookups(specs: VehicleSpec[]): VehicleLookups {
  return {
    years: () => [...new Set(specs.map((v) => v.year))].sort((a, b) => b - a),
    makesFor: (year) =>
      [...new Set(specs.filter((v) => v.year === year).map((v) => v.make))].sort(),
    modelsFor: (year, make) =>
      specs
        .filter((v) => v.year === year && v.make === make)
        .map((v) => v.model)
        .sort(),
    findVehicle: (year, make, model) =>
      specs.find((v) => v.year === year && v.make === make && v.model === model),
  };
}

/**
 * The year/make slice of the dataset — about 3 kB, so it ships in the main
 * bundle and the picker's first two selects render with no network wait.
 * Generated alongside vehicles.json by scripts/build-vehicles.mjs.
 */
export interface VehicleIndex {
  years(): number[];
  makesFor(year: number): string[];
}

const rawIndex = indexData as { years: number[]; makesByYear: Record<string, string[]> };

export const vehicleIndex: VehicleIndex = {
  years: () => rawIndex.years,
  makesFor: (year) => rawIndex.makesByYear[String(year)] ?? [],
};

/**
 * The full dataset (~250 kB) is a lazily-imported chunk, kept out of the main
 * bundle so first paint doesn't wait on parsing 2,348 rows it may never need —
 * a returning user's vehicle already lives in saved settings. Only the model
 * select and findVehicle() need it.
 *
 * Cached after the first load, and `loadedVehicleLookups()` exposes that cache
 * synchronously so a second visit to the picker in the same session has no
 * async step at all.
 */
let cache: VehicleLookups | null = null;
let inflight: Promise<VehicleLookups> | null = null;

/** The full lookups if already loaded this session, else null. Never triggers a load. */
export function loadedVehicleLookups(): VehicleLookups | null {
  return cache;
}

export function loadVehicleLookups(): Promise<VehicleLookups> {
  if (cache) return Promise.resolve(cache);
  inflight ??= import('./vehicles.json').then((mod) => {
    cache = makeVehicleLookups(mod.default as VehicleSpec[]);
    return cache;
  });
  return inflight;
}
