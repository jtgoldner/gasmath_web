// All product-tunable knobs live here (CLAUDE.md "Config constants").

/** Prices older than this are excluded from the candidate set (PRD §6, Q5). */
export const STALENESS_HOURS = 12;

/** Nearby Search radius in meters — the Places API maximum (PRD §6, Q3). */
export const SEARCH_RADIUS_M = 50_000;

/** Effective costs within this many dollars are a tie; the nearer station wins (PRD §6). */
export const TIE_BREAK_DOLLARS = 0.05;

/**
 * Cap on candidates sent to OpenRouteService after the price pre-filter
 * (CLAUDE.md: don't route to all 20 stations if price alone eliminates most).
 */
export const MAX_ROUTING_CANDIDATES = 10;
