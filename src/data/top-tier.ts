/**
 * Top Tier licensed retail brands (PRD Q8): bundled static list, matched
 * fuzzily against station names.
 *
 * Reconciled against https://www.toptiergas.com/gasoline-brands/ on 2026-06-11.
 * Entries are canonical SHORT brand tokens (e.g. "Costco", not the registry's
 * "Costco Wholesale"), because isTopTierBrand checks whether a station NAME
 * contains a brand token — Google Places returns "Costco Gasoline", "Shell
 * #1234", etc.
 *
 * Scope: the recognizable U.S. retail gasoline brands. The authoritative
 * registry also lists many single-site regional/tribal licensees and
 * international brands (YPF, COPEC, PUMA, Primax, …) that won't appear in
 * typical U.S. Places results; reconcile those at the manual ~yearly refresh.
 * Note: Kwik Trip, Casey's, GetGo, and Holiday are NOT on the registry as of
 * this date despite common assumptions — do not re-add without checking.
 */
export const TOP_TIER_BRANDS: string[] = [
  '76',
  'ARCO',
  'Aloha',
  'Amoco',
  'BP',
  'Beacon',
  'Breakaway',
  'Cenex',
  'Chevron',
  'CITGO',
  'Co-op',
  'Conoco',
  'Costco',
  'CountryMark',
  'Dash In',
  'Diamond Shamrock',
  'Exxon',
  'Express Mart',
  'Gulf',
  'Harmons',
  'Hele',
  'Holiday Oil',
  'Kirkland',
  'Marathon',
  'Meijer',
  'Mobil',
  'Ohana Fuels',
  'Phillips 66',
  'QT',
  'QuikTrip',
  'Road Ranger',
  "Rutter's",
  'Shamrock',
  'Shell',
  'Simonson',
  'Sinclair',
  'Sunoco',
  'Texaco',
  'Valero',
];

/** Lowercase, strip punctuation and generic words ("Costco Gasoline" → "costco"). */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(gas|gasoline|fuel|fuels|station|stations)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a Top Tier brand appears as a whole word in the station name. */
export function isTopTierBrand(stationName: string): boolean {
  const padded = ` ${normalize(stationName)} `;
  return TOP_TIER_BRANDS.some((brand) => padded.includes(` ${normalize(brand)} `));
}
