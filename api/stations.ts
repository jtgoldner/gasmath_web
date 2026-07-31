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

/**
 * Members-only supplemental club-brand queries (PRD §6). These must match how
 * Places actually NAMES these places, not the brand's marketing name — the
 * live data calls them "Costco Gas Station", so that is what we search for.
 * Text Search is fuzzy, so the trailing noun mainly steers ranking; the
 * authoritative brand match is detectClub() on the returned displayName.
 */
const CLUB_QUERIES: Record<string, string> = {
  costco: 'Costco Gas Station',
  bjs: "BJ's Gas Station",
  samsclub: "Sam's Club Gas Station",
};

const EARTH_RADIUS_M = 6_371_008.8;

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Smallest lat/lng rectangle containing the search circle. Required because
 * searchText's locationRestriction accepts ONLY a rectangle — passing a circle
 * is rejected with HTTP 400 ("Unknown name \"circle\"").
 *
 * A rectangle circumscribing a 50 km circle reaches ~70 km at its corners, so
 * it is a strictly weaker filter than the circle it replaces. Results from this
 * box MUST still be post-filtered by true haversine distance (see withinRadius
 * below) or out-of-radius club stations come straight back.
 */
function boundingBox(lat: number, lng: number, radiusM: number) {
  // Derived from the same sphere haversineMeters uses, so the box provably
  // CONTAINS the circle. A mismatched constant here would shave the edges and
  // silently drop in-radius stations.
  const angular = radiusM / EARTH_RADIUS_M; // radians subtended at the centre
  const dLat = (angular * 180) / Math.PI;
  // Exact longitude half-width of the cap. The cheaper dLat/cos(lat) runs a few
  // metres short at the east/west edge, which would clip in-radius stations.
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const sinRatio = Math.sin(angular) / cosLat;
  const dLng =
    cosLat <= 0 || sinRatio >= 1 ? 180 : (Math.asin(sinRatio) * 180) / Math.PI;
  return {
    low: { latitude: Math.max(lat - dLat, -90), longitude: Math.max(lng - dLng, -180) },
    high: { latitude: Math.min(lat + dLat, 90), longitude: Math.min(lng + dLng, 180) },
  };
}

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

/**
 * DEBUG ONLY: a place Google returned that never became a candidate. Reported
 * so the debug panel can distinguish "Places returned nothing" from "Places
 * returned it and we dropped it here" — the two look identical downstream.
 */
export interface DroppedPlace {
  placeId: string | null;
  name: string;
  address?: string;
  lat: number | null;
  lng: number | null;
  reason: string;
}

/**
 * Splits one Places payload into usable wire stations and the places that were
 * dropped (with why). The set of stations returned is exactly what the previous
 * single-purpose converter produced — the drop reasons are new, the drops are not.
 */
function convertPlaces(payload: any): {
  stations: WireStation[];
  dropped: DroppedPlace[];
  names: string[];
} {
  const stations: WireStation[] = [];
  const dropped: DroppedPlace[] = [];
  const names: string[] = [];

  for (const place of payload?.places ?? []) {
    const name = place.displayName?.text ?? 'Gas station';
    names.push(name);

    const address = place.formattedAddress ?? undefined;
    const drop = (reason: string) =>
      dropped.push({
        placeId: place.id ?? null,
        name,
        address,
        lat: place.location?.latitude ?? null,
        lng: place.location?.longitude ?? null,
        reason,
      });

    // null = Places returned no fuelOptions field at all, which is a different
    // failure from "returned fuelOptions with nothing we can use".
    const fuelPrices: any[] | null = place.fuelOptions?.fuelPrices ?? null;
    const prices: WireStation['prices'] = {};
    const seenTypes: string[] = [];
    let sawUnusableGrade = false;

    for (const fp of fuelPrices ?? []) {
      if (typeof fp?.type === 'string') seenTypes.push(fp.type);
      const grade = GRADE_MAP[fp?.type];
      if (!grade) continue; // midgrade/diesel — out of MVP scope, not a defect
      if (!fp.updateTime || fp.price?.units == null) {
        sawUnusableGrade = true;
        continue;
      }
      const dollars = Number(fp.price.units) + (fp.price.nanos ?? 0) / 1e9;
      if (!(dollars > 0)) {
        sawUnusableGrade = true;
        continue;
      }
      prices[grade] = { price: dollars, updatedAt: fp.updateTime };
    }

    // A station with no usable price can never be recommended (hard rule 4) — drop it.
    if (!place.id) {
      drop('no place id returned');
      continue;
    }
    if (!place.location) {
      drop('no location returned');
      continue;
    }
    if (Object.keys(prices).length === 0) {
      if (fuelPrices === null) drop('no fuelOptions data');
      else if (fuelPrices.length === 0) drop('fuelOptions present but empty');
      else if (sawUnusableGrade)
        drop(`regular/premium present but unusable (no price or updateTime); types: ${seenTypes.join(', ')}`);
      else drop(`no regular/premium price; types: ${seenTypes.join(', ')}`);
      continue;
    }

    stations.push({
      placeId: place.id,
      name,
      address,
      lat: place.location.latitude,
      lng: place.location.longitude,
      prices,
    });
  }

  return { stations, dropped, names };
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

  const { lat, lng, clubs, debug } = (req.body ?? {}) as {
    lat?: unknown;
    lng?: unknown;
    clubs?: unknown;
    debug?: unknown;
  };
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
          // A rectangle, NOT a circle: searchText rejects circle here with
          // HTTP 400, which silently killed this query entirely. The box is
          // looser than the circle at its corners (~70 km vs 50 km), so
          // results are post-filtered by haversine below — the circle is
          // enforced by us even though Google will only accept the box.
          // No unbounded fallback: zero club results in range is correct.
          locationRestriction: { rectangle: boundingBox(lat, lng, SEARCH_RADIUS_M) },
        }),
      }),
    ),
  ];

  const responses = await Promise.all(requests);
  if (!responses[0].ok) {
    const body = await responses[0].text().catch(() => '');
    console.error(
      `[stations] Nearby Search FAILED: HTTP ${responses[0].status} — ${body.slice(0, 500)}`,
    );
    res.status(502).json({ error: `Places upstream returned ${responses[0].status}` });
    return;
  }

  // Query labels stay index-aligned with `requests` above so per-query counts
  // can be attributed to the query that produced them.
  const queryLabels = [
    { description: 'Nearby Search: gas_station (main candidate set)', club: false },
    ...clubQueries.map((text) => ({
      description: `Text Search (members-only supplemental): "${text}" — rectangle + haversine post-filter`,
      club: true,
    })),
  ];

  // The circle Google enforces for Nearby Search but not for Text Search.
  // Applied to club results so the rectangle's corners can't leak stations
  // beyond the search radius back in.
  const withinRadius = (p: { lat: number | null; lng: number | null }): boolean =>
    p.lat !== null && p.lng !== null && haversineMeters({ lat, lng }, { lat: p.lat, lng: p.lng }) <= SEARCH_RADIUS_M;

  const stations = new Map<string, WireStation>();
  const droppedByKey = new Map<string, DroppedPlace>();
  const queryMeta: Record<string, unknown>[] = [];

  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    const label = queryLabels[i];
    const base = {
      description: label.description,
      radiusMeters: SEARCH_RADIUS_M,
      mode: 'locationRestriction' as const,
    };

    // A failed supplemental club query still degrades gracefully for the user,
    // but it is NEVER silent: logged server-side and reported in the debug
    // panel. The circle-in-locationRestriction 400 went unnoticed for weeks
    // precisely because this path used to be a bare `continue`.
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error(
        `[stations] Places query FAILED: ${label.description} → HTTP ${r.status} — ${body.slice(0, 500)}`,
      );
      queryMeta.push({
        ...base,
        rawResultCount: 0,
        usableCount: 0,
        upstreamStatus: r.status,
        upstreamError: body.slice(0, 400),
        ...(label.club ? { rawPlaceNames: [] } : {}),
      });
      continue;
    }

    const { stations: converted, dropped, names } = convertPlaces(await r.json());

    // Text Search was bounded by a rectangle, which is looser than the circle
    // at its corners — enforce the real radius here. Nearby Search was already
    // circle-bounded by Google, so it passes through untouched.
    const inRadius = label.club ? converted.filter(withinRadius) : converted;
    const droppedInRadius = label.club ? dropped.filter(withinRadius) : dropped;
    const discarded =
      converted.length - inRadius.length + (dropped.length - droppedInRadius.length);

    for (const s of inRadius) {
      if (!stations.has(s.placeId)) stations.set(s.placeId, s);
    }
    for (const d of droppedInRadius) {
      droppedByKey.set(d.placeId ?? `${d.name}|${d.lat}|${d.lng}`, d);
    }
    if (discarded > 0) {
      console.warn(
        `[stations] ${label.description}: discarded ${discarded} result(s) outside ${SEARCH_RADIUS_M} m`,
      );
    }
    queryMeta.push({
      ...base,
      rawResultCount: names.length,
      usableCount: inRadius.length,
      ...(discarded > 0 ? { outOfRadiusDiscarded: discarded } : {}),
      ...(label.club ? { rawPlaceNames: names } : {}),
    });
  }

  res.setHeader('Cache-Control', 'no-store');

  // DEBUG ONLY: report the real, server-side query parameters — these are the
  // ACTUAL values this deployed function used (not whatever src/config.ts
  // says), since the constants above are inlined copies that can drift.
  // Both queries use locationRestriction (a hard cutoff) as of 2026-06-13 —
  // the supplemental club query previously used locationBias, which let
  // club-brand matches hundreds of miles away into the candidate set.
  // rawResultCount vs usableCount separates "Google returned nothing" from
  // "Google returned places we dropped for lack of price data".
  const meta =
    debug === true ? { searchRadiusMeters: SEARCH_RADIUS_M, queries: queryMeta } : undefined;

  // Returned on every request, not just debug: the verdict screen tells a club
  // member when Places had no price for their club nearby, instead of silently
  // omitting it. Display-only — these never become candidates.
  // A place usable from any one query is not a drop, even if another query
  // returned it in an unusable form.
  const droppedPlaces = [...droppedByKey.values()].filter(
    (d) => !(d.placeId && stations.has(d.placeId)),
  );

  res.status(200).json({ stations: [...stations.values()], droppedPlaces, ...(meta ? { meta } : {}) });
}
