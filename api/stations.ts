import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mirrors SEARCH_RADIUS_M in src/config.ts — inlined because Vercel bundles
// each function in isolation and imports from outside api/ fail at runtime.
const SEARCH_RADIUS_M = 50_000;

/**
 * Server-side proxy for Google Places API (New). The API key lives only in
 * this function's environment (hard rule 7) and never reaches the client.
 * Responses pass through with Cache-Control: no-store — Places content may
 * not be cached per Google's policy (PRD Q9); nothing is persisted here.
 */

const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.fuelOptions';

/** Members-only supplemental club-brand queries (PRD §6). */
const CLUB_QUERIES: Record<string, string> = {
  costco: 'Costco Gasoline',
  bjs: "BJ's Gas",
};

/** Midgrade and diesel are out of MVP scope; unknown grades are dropped. */
const GRADE_MAP: Record<string, 'regular' | 'premium'> = {
  REGULAR_UNLEADED: 'regular',
  PREMIUM: 'premium',
};

export interface WirePrice {
  price: number;
  updatedAt: string;
}

export interface WireStation {
  placeId: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  prices: Partial<Record<'regular' | 'premium', WirePrice>>;
}

function toWireStations(payload: any): WireStation[] {
  const out: WireStation[] = [];
  for (const place of payload?.places ?? []) {
    const prices: WireStation['prices'] = {};
    for (const fp of place.fuelOptions?.fuelPrices ?? []) {
      const grade = GRADE_MAP[fp.type];
      if (!grade || !fp.updateTime || fp.price?.units == null) continue;
      const dollars = Number(fp.price.units) + (fp.price.nanos ?? 0) / 1e9;
      if (!(dollars > 0)) continue;
      prices[grade] = { price: dollars, updatedAt: fp.updateTime };
    }
    // A station with no usable price can never be recommended (hard rule 4) — drop it.
    if (!place.id || !place.location || Object.keys(prices).length === 0) continue;
    out.push({
      placeId: place.id,
      name: place.displayName?.text ?? 'Gas station',
      address: place.formattedAddress ?? undefined,
      lat: place.location.latitude,
      lng: place.location.longitude,
      prices,
    });
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY is not configured' });
    return;
  }

  const { lat, lng, clubs } = (req.body ?? {}) as { lat?: unknown; lng?: unknown; clubs?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ error: 'lat and lng are required numbers' });
    return;
  }
  const clubQueries = Array.isArray(clubs)
    ? clubs.flatMap((c) => (typeof c === 'string' && CLUB_QUERIES[c] ? [CLUB_QUERIES[c]] : []))
    : [];

  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': key,
    'X-Goog-FieldMask': FIELD_MASK,
  };
  const circle = { center: { latitude: lat, longitude: lng }, radius: SEARCH_RADIUS_M };

  const requests: Promise<Response>[] = [
    fetch(NEARBY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        includedTypes: ['gas_station'],
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        locationRestriction: { circle },
      }),
    }),
    ...clubQueries.map((textQuery) =>
      fetch(TEXT_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          textQuery,
          includedType: 'gas_station',
          pageSize: 5,
          locationBias: { circle },
        }),
      }),
    ),
  ];

  const responses = await Promise.all(requests);
  if (!responses[0].ok) {
    res.status(502).json({ error: `Places upstream returned ${responses[0].status}` });
    return;
  }

  const stations = new Map<string, WireStation>();
  for (const r of responses) {
    if (!r.ok) continue; // a failed supplemental club query degrades gracefully
    for (const s of toWireStations(await r.json())) {
      if (!stations.has(s.placeId)) stations.set(s.placeId, s);
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ stations: [...stations.values()] });
}
