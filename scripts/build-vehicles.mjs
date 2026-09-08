// Build the bundled vehicle dataset (PRD §4): merge EPA combined-MPG data with
// the curated tank-capacity table into src/data/vehicles.json.
//
//   node scripts/build-vehicles.mjs   (or: npm run build:data)
//
// Inputs:
//   data/epa-vehicles.csv     raw EPA dataset (gitignored; see README to fetch)
//   data/tank-capacity.csv    curated tank capacities, keyed to EPA baseModel
// Output:
//   src/data/vehicles.json    [{ year, make, model, combinedMpg, tankCapacityGal, fuelType }]
//
// The curated table is the coverage driver: a (make, baseModel) becomes a
// selectable vehicle only if it has a tank capacity here AND EPA fuel data.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const EPA = new URL('../data/epa-vehicles.csv', import.meta.url);
const TANKS = new URL('../data/tank-capacity.csv', import.meta.url);
const OUT = new URL('../src/data/vehicles.json', import.meta.url);
const MIN_YEAR = 2015;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

if (!existsSync(EPA)) {
  console.error('Missing data/epa-vehicles.csv. Fetch it first:');
  console.error('  curl -o data/epa-vehicles.csv https://www.fueleconomy.gov/feg/epadata/vehicles.csv');
  process.exit(1);
}

// --- curated tank table: (make, baseModel) -> gallons ---
const tanks = new Map();
for (const line of readFileSync(TANKS, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const [make, baseModel, gal] = t.split(',');
  tanks.set(`${make}||${baseModel}`, Number(gal));
}

// --- EPA rows grouped by (year, make, baseModel) ---
const epa = parseCsv(readFileSync(EPA, 'utf8'));
const idx = Object.fromEntries(epa[0].map((h, i) => [h, i]));
const groups = new Map(); // year||make||base -> { gasMpgs:[], dieselMpgs:[] }

for (let r = 1; r < epa.length; r++) {
  const row = epa[r];
  const year = Number(row[idx.year]);
  if (year < MIN_YEAR) continue;
  const make = row[idx.make];
  const base = row[idx.baseModel];
  if (!base || !tanks.has(`${make}||${base}`)) continue; // curated coverage only
  const fuel = row[idx.fuelType1];
  const mpg = Number(row[idx.comb08]);
  if (!(mpg > 0)) continue;
  const key = `${year}||${make}||${base}`;
  if (!groups.has(key)) groups.set(key, { gasMpgs: [], dieselMpgs: [] });
  const g = groups.get(key);
  if (/gasoline/i.test(fuel)) g.gasMpgs.push(mpg);
  else if (/diesel/i.test(fuel)) g.dieselMpgs.push(mpg);
  // Electricity/Hydrogen trims are ignored — irrelevant to gas math.
}

const vehicles = [];
for (const [key, g] of groups) {
  const [year, make, model] = key.split('||');
  // A nameplate is "diesel" (gated) only if it has no gasoline trim at all.
  const isGas = g.gasMpgs.length > 0;
  const mpgs = isGas ? g.gasMpgs : g.dieselMpgs;
  if (mpgs.length === 0) continue;
  vehicles.push({
    year: Number(year),
    make,
    model,
    combinedMpg: Math.round(median(mpgs)),
    tankCapacityGal: tanks.get(`${make}||${model}`),
    fuelType: isGas ? 'gasoline' : 'diesel',
  });
}

vehicles.sort(
  (a, b) => b.year - a.year || a.make.localeCompare(b.make) || a.model.localeCompare(b.model),
);

writeFileSync(OUT, JSON.stringify(vehicles, null, 0) + '\n');

// --- report: curated rows that never matched EPA (likely a baseModel typo) ---
const matched = new Set(vehicles.map((v) => `${v.make}||${v.model}`));
const unmatched = [...tanks.keys()].filter((k) => !matched.has(k));
console.log(`Wrote ${vehicles.length} vehicles across ${new Set(vehicles.map((v) => v.year)).size} years.`);
console.log(`Curated nameplates: ${tanks.size}, matched: ${matched.size}.`);
if (unmatched.length) {
  console.log(`\nUNMATCHED curated rows (check baseModel string vs EPA):`);
  console.log(unmatched.map((k) => '  ' + k.replace('||', ' ')).join('\n'));
}
