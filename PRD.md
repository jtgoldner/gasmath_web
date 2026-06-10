# GasMath — Product Requirements Document

**Version:** 1.2
**Owner:** Jonathan Goldner
**Date:** June 10, 2026
**Status:** Build-ready — all product decisions resolved; Q8/Q9 are build-time tasks with agreed approaches

---

## 1. Overview

GasMath is a consumer web application that answers one question: **"Which gas station is actually cheapest for me to fill up at, right now?"**

Unlike price-listing apps (GasBuddy, Google Maps), GasMath computes the *true total cost* of each fill-up option — factoring in the fuel burned getting to each station, the user's specific vehicle efficiency, live station-level prices, and how much fuel the user intends to buy. The output is a single decision, not a list.

**Positioning:** A decision engine, not a directory.

**Business goal:** Ship a working, instrumented POC; build traction; position for a data partnership or acquisition conversation with GasBuddy/PDI Technologies.

---

## 2. Goals & Non-Goals

### Goals (MVP)
- Deliver one clear verdict: the most cost-effective station for this user, right now
- Zero registration/login — all personalization via localStorage
- Live, station-level fuel prices
- Real routing distances (not straight-line estimates)
- Respect warehouse club membership status in recommendations
- Live on **gasmath.app**, HTTPS, installable as a PWA

### Non-Goals (MVP)
- Loyalty/rewards program integration (post-MVP)
- Multiple vehicle support (post-MVP)
- Dashboard photo upload for fuel level reading (post-MVP)
- Native iOS app (post-MVP; web-first strategy)
- Second-choice or ranked-list output — **one answer only**
- User accounts, server-side user data storage of any kind

---

## 3. Architecture Principles

1. **Zero user-data backend.** No accounts, no stored user data, no retention exposure. Vehicle and membership settings live in localStorage only.
2. **Thin proxy is permitted.** A serverless edge function (Cloudflare Worker or equivalent) holds the Google API key. It stores no user data. **Caching constraint:** Google's Places policies restrict caching/storing Places content; only place IDs are exempt (storable indefinitely). Proxy design: persist place IDs per area; price data passes through with at most a short transient TTL pending Service Specific Terms review (§9, Q9).
3. **Ship first, optimize iteratively.**
4. **GitHub-native.** Repo under `jtgoldner`; hosting deploys directly from the repo via **Vercel** (decided 2026-06-10 — owner has an existing account). Built with Claude Code, not Lovable.

---

## 4. Data Sources & Dependencies

| Dependency | Purpose | Notes |
|---|---|---|
| Google Places API (New) — Nearby Search + `fuelOptions` field | Station discovery + live station-level fuel prices by grade | Enterprise+Atmosphere SKU (~$25/1K calls; 1,000 free Enterprise events/mo). Must be called via proxy with referrer restriction + daily quota caps. **ToS verified:** map-free display permitted with Google Maps logo attribution; place IDs storable indefinitely; broad caching of other content restricted (see §9, Q9). |
| OpenRouteService | Driving distance/time from user location to each candidate station | Free tier. Real routing data is core to the value prop — no user-entered distances. |
| Vehicle MPG dataset (e.g., EPA fueleconomy.gov data) | Map year/make/model → combined MPG and tank capacity | Can be bundled as static JSON; no runtime API dependency required. |
| Browser Geolocation API | Precise user location | Permission requested post-onboarding, at point of need. |

---

## 5. User Flows

### 5.1 First-load onboarding
1. **Vehicle selection:** User selects **year, make, model** of their car. Stored in localStorage. Used to infer MPG and tank capacity. No registration or login at any point. **Diesel vehicles are excluded at MVP:** if the selected vehicle is diesel, show a friendly "diesel support coming soon" message rather than proceeding with gasoline pricing.
2. **Warehouse club toggle:** User indicates membership status for warehouse club gas (e.g., **Costco, BJ's**) — member or not. Stored in localStorage.
   - If the user is **not** a member of a given club, that club's stations are **never shown or recommended**.
3. **Top Tier toggle:** User indicates whether to limit results to **Top Tier certified gas only** (no drug-store/off-brand gas). **Default: ON.** Stored in localStorage; changeable at any time in settings. When ON, non–Top Tier stations are excluded from the candidate set entirely.
4. **High octane preference:** Binary yes/no — "Prefer high octane fuel?" **Default: OFF.** Stored in localStorage; changeable in settings. OFF → decision engine prices against regular; ON → prices against premium. Stations not reporting a price for the selected grade are excluded from the candidate set. Midgrade is deliberately out of scope for MVP.

### 5.2 Core flow (every session)
1. **Location permission:** App requests precise location via browser geolocation permission.
2. **Fuel-need input:** User indicates approximately how much gas they need via a horizontal slider styled like an electronic gas gauge:
   - **E on the left, F on the right**
   - Hash marks at each **quarter-tank** interval
   - **Continuous selection** — user can choose any point, not locked to quarters or eighths
   - Slider value + vehicle tank capacity → gallons needed
3. **Computation** (see §6)
4. **Verdict screen:** One recommendation. *"The most cost-effective gas station for you right now is ___. You'll save $X by going to this station."* No second option, no ranked list.
   - **$X baseline:** savings vs. filling up at the nearest eligible station — the "autopilot" default. If the winner *is* the nearest station, show affirming copy instead (e.g., "Good news — your closest station is also your cheapest.").

### 5.3 Settings
- Change vehicle (single vehicle only at MVP)
- Change warehouse club membership status
- Change Top Tier–only toggle
- Change high octane preference
- (Settings changes persist to localStorage immediately)

---

## 6. Decision Engine Logic

For each candidate station within the search radius:

```
gallons_needed      = slider_fraction × tank_capacity
detour_gallons      = round_trip_extra_miles ÷ vehicle_mpg   (via routing API)
effective_cost      = (gallons_needed × station_price) + (detour_gallons × station_price)
```

- Candidate set: single Nearby Search at 50 km max radius, **ranked by distance, capped at 20 results** (API max). The cap makes the effective search area self-adapt to station density — tight in cities, wide in rural areas — with no user input or density classification.
- **Warehouse club supplemental query:** if the user is a club member, run a second targeted search for their club brand(s), since dense areas may push a winning club station out of the 20-nearest set. Members only; merged into the candidate set before filtering.
- Filters applied to candidates: club membership rules, Top Tier (if ON), fuel grade availability, price staleness.
- Distance basis: real driving routes from OpenRouteService, not straight-line.
- **Winner:** lowest effective total cost. Output exactly one station.
- Stale-price handling: prices older than the staleness threshold are excluded. **Threshold: 12 hours**, implemented as a single config constant so it's trivially adjustable.

- **Tie-breaking:** if two stations have effectively equal total cost (within $0.05, config constant), the nearer station wins.

---

## 7. Platform & Technical Requirements

| Requirement | Detail |
|---|---|
| Domain | **gasmath.app**, registered via Namecheap; DNS pointed at hosting provider |
| SSL | **Required.** Note: `.app` is an HSTS-preloaded TLD — HTTPS is mandatory at the browser level. Hosting (Cloudflare Pages / Vercel) provides certs automatically. |
| Hosting | **Vercel**: static frontend deployed from GitHub repo; serverless function in `/api` for the price proxy/cache. **Licensing note:** free Hobby tier is judged defensible only while the app is ad-free and costs users nothing. **Before any direct monetization, hosting must move to a paid Vercel plan or Cloudflare** — treat as a planned scaling maneuver. |
| Repo | GitHub, under `jtgoldner` |
| Storage | localStorage only (vehicle, club membership, optional cached results) |
| PWA | Manifest + iOS meta tags + icon; installable to home screen |
| Analytics | Google Analytics 4 + Search Console (traction data supports acquisition narrative) |
| Attribution | "Google Maps" logo displayed with station/price data on verdict screen (map-free display permitted); follow Google style guidelines; visually distinguish Google content. If results are ever shown on a map, it must be a Google Map. |
| Legal pages | Publicly accessible Terms of Use + Privacy Policy incorporating Google's ToS and Privacy Policy (required by Places API policies; also appropriate given location permission) |
| Cost controls | API key referrer-restricted, daily quota cap; place-ID persistence per area; no long-lived shared price cache (per Places caching policy — see §9, Q9) |

---

## 8. Post-MVP Roadmap (captured, not scoped)

- Loyalty/rewards integration (e.g., per-gallon brand discounts)
- Multi-vehicle selector
- Dashboard photo upload → fuel level inference
- Native iOS app (deepens loyalty-card and camera features)
- Additional languages

---

## 9. Open Questions

1. ~~Onboarding completion step~~ — **Resolved:** onboarding includes Top Tier–only toggle (default ON), changeable in settings.
2. ~~Fuel grade~~ — **Resolved:** onboarding includes "Prefer high octane fuel?" binary toggle, default OFF (regular). ON prices against premium. Midgrade deferred post-MVP. **Diesel excluded at MVP** with a "coming soon" message at vehicle selection.
3. ~~Search radius~~ — **Resolved:** fixed 50 km bound (the API maximum), ranked by distance, top 20 results. Station density is inferred implicitly — the 20-nearest set is naturally tight in metros and wide in rural areas. No user-facing radius control; no density profiling. Supplemental club-brand query for members (see §6).
4. ~~No-data fallback~~ — **Resolved:** progressive relaxation. If filters empty the candidate set, offer to relax in order: Top Tier filter first ("No Top Tier stations nearby with current prices — show all stations?"), then staleness. Never dead-end without offering an option. Club filter is never relaxed (hard rule).
5. ~~Price staleness threshold~~ — **Resolved:** 12 hours; single config constant for easy adjustment.
6. ~~Google ToS~~ — **Resolved:** no map required on verdict screen; "Google Maps" logo attribution required next to Places data; if data is ever shown on a map it must be a Google Map; app must publish Terms of Use + Privacy Policy incorporating Google's.
7. ~~Verdict screen content~~ — **Resolved:** show savings: "You'll save $X by going to this station." **$X baseline confirmed:** savings vs. filling up at the nearest eligible station (the user's autopilot default). If the winner *is* the nearest station, show affirming copy instead (e.g., "Good news — your closest station is also your cheapest.").
8. **Top Tier data source** *(build-time task, approach agreed)*: bundle a static brand list from toptiergas.com as JSON; match on station brand/name with fuzzy handling (e.g., "Costco Gasoline" vs "Costco"). Refresh manually ~yearly.
9. **Caching strategy vs. Places policy** *(build-time task, approach agreed)*: review GMP Service Specific Terms before finalizing proxy. Default design: persist place IDs only; price data pass-through or short transient TTL; per-session client caching; referrer restriction + daily quota caps.

---

## 10. Success Criteria (POC)

- Live at https://gasmath.app
- Onboarding → verdict in under 60 seconds for a new user
- Verdict accuracy validated manually against real-world prices (spot checks)
- Monthly Google API spend stays within free tier at POC traffic levels
- GA4 instrumented from day one
