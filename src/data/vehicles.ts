export type FuelType = 'gasoline' | 'diesel';

export interface VehicleSpec {
  year: number;
  make: string;
  model: string;
  combinedMpg: number;
  tankCapacityGal: number;
  fuelType: FuelType;
}

/**
 * MOCK (Milestone 2): hand-picked subset so the cascading picker works.
 * Milestone 3 replaces this with the bundled EPA-derived dataset (PRD §4;
 * note tank capacity needs a non-EPA source — see build-time task).
 */
export const VEHICLES: VehicleSpec[] = [
  { year: 2024, make: 'Toyota', model: 'Camry', combinedMpg: 32, tankCapacityGal: 15.8, fuelType: 'gasoline' },
  { year: 2024, make: 'Toyota', model: 'RAV4', combinedMpg: 30, tankCapacityGal: 14.5, fuelType: 'gasoline' },
  { year: 2024, make: 'Toyota', model: 'Corolla', combinedMpg: 35, tankCapacityGal: 13.2, fuelType: 'gasoline' },
  { year: 2024, make: 'Honda', model: 'Civic', combinedMpg: 36, tankCapacityGal: 12.4, fuelType: 'gasoline' },
  { year: 2024, make: 'Honda', model: 'CR-V', combinedMpg: 30, tankCapacityGal: 14.0, fuelType: 'gasoline' },
  { year: 2024, make: 'Honda', model: 'Accord', combinedMpg: 32, tankCapacityGal: 14.8, fuelType: 'gasoline' },
  { year: 2024, make: 'Ford', model: 'F-150', combinedMpg: 20, tankCapacityGal: 26.0, fuelType: 'gasoline' },
  { year: 2024, make: 'Ford', model: 'Escape', combinedMpg: 30, tankCapacityGal: 14.7, fuelType: 'gasoline' },
  { year: 2024, make: 'Ford', model: 'F-250 Power Stroke', combinedMpg: 15, tankCapacityGal: 34.0, fuelType: 'diesel' },
  { year: 2023, make: 'Toyota', model: 'Camry', combinedMpg: 32, tankCapacityGal: 15.8, fuelType: 'gasoline' },
  { year: 2023, make: 'Toyota', model: 'Highlander', combinedMpg: 24, tankCapacityGal: 17.9, fuelType: 'gasoline' },
  { year: 2023, make: 'Honda', model: 'Civic', combinedMpg: 35, tankCapacityGal: 12.4, fuelType: 'gasoline' },
  { year: 2023, make: 'Ford', model: 'F-150', combinedMpg: 20, tankCapacityGal: 26.0, fuelType: 'gasoline' },
  { year: 2023, make: 'Chevrolet', model: 'Equinox', combinedMpg: 28, tankCapacityGal: 14.9, fuelType: 'gasoline' },
  { year: 2023, make: 'Chevrolet', model: 'Silverado 1500', combinedMpg: 19, tankCapacityGal: 24.0, fuelType: 'gasoline' },
  { year: 2023, make: 'Chevrolet', model: 'Silverado 1500 Duramax', combinedMpg: 26, tankCapacityGal: 24.0, fuelType: 'diesel' },
  { year: 2022, make: 'Toyota', model: 'Camry', combinedMpg: 32, tankCapacityGal: 15.8, fuelType: 'gasoline' },
  { year: 2022, make: 'Honda', model: 'CR-V', combinedMpg: 29, tankCapacityGal: 14.0, fuelType: 'gasoline' },
  { year: 2022, make: 'Ford', model: 'Explorer', combinedMpg: 23, tankCapacityGal: 17.9, fuelType: 'gasoline' },
];

export function years(): number[] {
  return [...new Set(VEHICLES.map((v) => v.year))].sort((a, b) => b - a);
}

export function makesFor(year: number): string[] {
  return [...new Set(VEHICLES.filter((v) => v.year === year).map((v) => v.make))].sort();
}

export function modelsFor(year: number, make: string): string[] {
  return VEHICLES.filter((v) => v.year === year && v.make === make)
    .map((v) => v.model)
    .sort();
}

export function findVehicle(year: number, make: string, model: string): VehicleSpec | undefined {
  return VEHICLES.find((v) => v.year === year && v.make === make && v.model === model);
}
