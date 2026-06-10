# CLAUDE.md — GasMath

Project briefing for Claude Code sessions. Read this and `PRD.md` before making changes.

## What this is

GasMath (https://gasmath.app) answers one question: **which gas station is actually cheapest for me to fill up at, right now** — factoring in live station prices, real driving distance, the user's vehicle MPG, and how much fuel they need. Output is **one verdict, never a list**. Full requirements live in `PRD.md` at the repo root — it is the source of truth for product behavior. If code and PRD conflict, flag it; don't silently pick one.

## Owner & context

- Owner: Jonathan Goldner (GitHub: jtgoldner). Product leader, comfortable with full-stack concepts, building hands-on with AI assistance.
- Business goal: working, instrumented POC → traction → data partnership/acquisition conversation with GasBuddy/PDI. Code quality and repo presentation matter as a professional portfolio signal.

## Hard rules (do not violate, do not "improve" away)

1. **Zero user data on the server.** No accounts, no login, no server-side storage of anything user-specific. All personalization (vehicle, club membership, Top Tier toggle, octane preference) lives in browser localStorage.
2. **One verdict.** Never render a ranked list or second option.
3. **Club filter is absolute.** Non-members never see warehouse club stations (Costco, BJ's) — not grayed out, not "FYI" — absent.
4. **Never recommend on a guessed price.** Stations missing a price for the selected grade, or with prices older than the staleness threshold, are excluded.
5. **Do not change existing functionality when adding features.** When in doubt, ask.
6. **Google attribution is a legal requirement, not a style choice.** "Google Maps" logo must appear with station/price data (see PRD §7). Don't remove it during redesigns.
7. **Secrets never in the repo or client bundle.** The Google API key lives only in the edge function's environment variables.

## Architecture

- **Frontend:** static PWA (vanilla or lightweight framework — keep deps minimal), deployed from this repo via **Vercel** (PRD §3/§7). Free Hobby tier is acceptable only while the app is ad-free and non-monetized; before any direct monetization, move to a paid plan or Cloudflare. Domain gasmath.app (Namecheap DNS). `.app` is HSTS-preloaded; HTTPS is automatic via host.
- **Edge proxy:** one serverless function holding the Google Places API key. Responsibilities: call Nearby Search (New) with `fuelOptions` field mask; enforce daily quota discipline. **Caching constraint (PRD Q9):** Google's Places policy restricts caching content — place IDs may be stored indefinitely; price data is pass-through or short transient TTL only. Verify against GMP Service Specific Terms before adding any shared cache.
- **Routing:** OpenRouteService for real driving distances (free tier, key also in env vars). Pre-filter candidates before fan-out — don't route to all 20 stations if price alone eliminates most.
- **Static data bundled as JSON in repo:**
  - EPA fueleconomy.gov–derived vehicle dataset: year/make/model → combined MPG + tank capacity (+ fuel type, to gate diesel)
  - Top Tier certified brand list (from toptiergas.com), with fuzzy brand matching ("Costco Gasoline" → "Costco"). Manual refresh ~yearly.
- **Analytics:** GA4 from day one. Also Search Console verification.

## Decision engine (PRD §6 is canonical)

```
gallons_needed = slider_fraction × tank_capacity
detour_gallons = round_trip_extra_miles ÷ vehicle_mpg
effective_cost = (gallons_needed + detour_gallons) × station_price
```

- Candidate set: one Nearby Search, 50 km radius (API max), ranked by distance, top 20. Density self-adapts via the cap.
- Supplemental club-brand query for members only; merge before filtering.
- Filter order: club rules → Top Tier (if ON) → grade availability → staleness (12h).
- Winner = lowest effective cost; tie within $0.05 → nearer station.
- Savings $X = winner vs. nearest eligible station. Winner == nearest → affirming copy instead of "$0".
- Empty candidate set → progressive relaxation: offer Top Tier OFF first, then staleness. Club filter never relaxes.

## Config constants (centralize in one file)

- `STALENESS_HOURS = 12`
- `SEARCH_RADIUS_M = 50000`
- `TIE_BREAK_DOLLARS = 0.05`
- `MAX_ROUTING_CANDIDATES` (pre-filter cap before OpenRouteService fan-out)

## Working conventions

- Small, frequent commits with clear messages. Push to GitHub at the end of every session.
- Keep `PRD.md` updated when product decisions change — bump its version number.
- Owner writes final user-facing copy; use placeholder copy marked `// COPY: draft` and keep it easy to find.
- Mobile-first UI: primary use case is phone-in-hand, about to drive. Fuel slider: E left, F right, quarter-tank hash marks, continuous values.
- Onboarding order: vehicle → warehouse clubs → Top Tier (default ON) → high octane (default OFF). All editable in Settings.
- Launch checklist items easy to forget: Terms of Use + Privacy Policy pages (Google policy requirement), PWA manifest + icons, GA4, Google Maps logo attribution, API key referrer restriction + quota cap.

## What NOT to build (MVP non-goals)

Loyalty integrations, multi-vehicle, diesel (show "coming soon" at vehicle selection), midgrade, maps on the verdict screen, ranked lists, accounts, any server-side user storage.
