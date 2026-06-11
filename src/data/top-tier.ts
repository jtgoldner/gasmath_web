/**
 * Top Tier licensed retail brands (PRD Q8): bundled static list, matched
 * fuzzily against station names. Manual refresh ~yearly.
 *
 * TODO(launch): verify this list against https://www.toptiergas.com/licensed-brands
 * before go-live — it was drafted from memory and brands change.
 */
export const TOP_TIER_BRANDS: string[] = [
  '76',
  'ARCO',
  'Aloha',
  'Amoco',
  'BP',
  'Beacon',
  "Casey's",
  'Cenex',
  'Chevron',
  'CITGO',
  'Conoco',
  'Costco',
  'CountryMark',
  'Diamond Shamrock',
  'Exxon',
  'Express Mart',
  'GetGo',
  'Harmons',
  'Hele',
  'Holiday',
  'Kirkland',
  'Kwik Star',
  'Kwik Trip',
  'Marathon',
  'Meijer',
  'Metro Petro',
  'Mobil',
  'Ohana Fuels',
  'Phillips 66',
  'QuikTrip',
  "Rutter's",
  'Shamrock',
  'Shell',
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
