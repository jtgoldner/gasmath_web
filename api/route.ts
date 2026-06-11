import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MAX_ROUTING_CANDIDATES } from '../src/config';

/**
 * Server-side proxy for the OpenRouteService matrix API (real driving
 * distances, PRD §6). The key stays in this function's environment.
 * One matrix call covers the whole candidate fan-out.
 */

const ORS_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car';

interface Point {
  lat: number;
  lng: number;
}

function isPoint(p: unknown): p is Point {
  const q = p as Point;
  return typeof q?.lat === 'number' && typeof q?.lng === 'number';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const key = process.env.ORS_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'ORS_API_KEY is not configured' });
    return;
  }

  const { origin, destinations } = (req.body ?? {}) as { origin?: unknown; destinations?: unknown };
  if (
    !isPoint(origin) ||
    !Array.isArray(destinations) ||
    destinations.length === 0 ||
    destinations.length > MAX_ROUTING_CANDIDATES ||
    !destinations.every(isPoint)
  ) {
    res.status(400).json({
      error: `origin and 1–${MAX_ROUTING_CANDIDATES} destinations are required`,
    });
    return;
  }

  const upstream = await fetch(ORS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({
      locations: [[origin.lng, origin.lat], ...destinations.map((d) => [d.lng, d.lat])],
      sources: [0],
      destinations: destinations.map((_, i) => i + 1),
      metrics: ['distance'],
      units: 'mi',
    }),
  });
  if (!upstream.ok) {
    res.status(502).json({ error: `ORS upstream returned ${upstream.status}` });
    return;
  }

  const json = (await upstream.json()) as { distances?: (number | null)[][] };
  res.setHeader('Cache-Control', 'no-store');
  // null entries mean ORS could not route to that destination.
  res.status(200).json({ distancesMiles: json.distances?.[0] ?? [] });
}
