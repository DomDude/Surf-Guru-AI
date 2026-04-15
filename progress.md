# Progress

> **Note (2026-04-11):** Project handbook was upgraded. A new `CLAUDE.md` now holds developer conventions and parallel-session protocol; `task_plan.md` was rewritten into phased parallel tracks (A/B/C/D/E); `findings.md` was populated with API quirks, competitor intel, and known debts. No code changes in this pass.
>
> **Note (2026-04-13):** `gemini.md` and `architecture/` eliminated. Schemas, persona rules, and execution flow now live in `CLAUDE.md`. API reference and SOP content moved into `findings.md`. New sessions: read `CLAUDE.md` → `task_plan.md` → `findings.md`.

## Current state — 2026-04-13 (start here next session)

**Phase 1: COMPLETE.** All tracks 1A–1D done. App is truthful, hardened, and cleanly structured.

**Phase 2: IN PROGRESS.** Completed so far:
- 2D.1 ✅ In-memory LRU cache (`src/lib/cache.ts`)
- 2C.1 ✅ Gazetteer seeded — 48 spots (`src/data/gazetteer.json`). Dominik to verify Algarve coords + add 2 spots to hit 50.
- 2C.2 ✅ Nominatim adapter (`src/tools/geocode_nominatim.ts`)
- 2C.3 ✅ Smart geocoding chain live — `geocodeLocation` now chains gazetteer → Nominatim → Gemini+cross-check
- 2A.1 ✅ `ForecastSource` interface + `ForecastPoint` in `src/tools/forecast_sources/types.ts`
- 2A.2 ✅ Open-Meteo adapter in `src/tools/forecast_sources/open_meteo.ts`

**Ready to start next (all unblocked):**
- **2A.3** — NOAA WaveWatch III adapter via Open-Meteo `&models=` param (no new API key). Can run parallel with 2D.2.
- **2D.2** — Wire `withCache` into geocoder + forecast tools. Straightforward now.
- **2C.4** — Beach facing direction from OSM Overpass API (feeds offshore/onshore logic in `compute_stats.ts`).

**Blocked on user decision:**
- **2B** (real tide data) — needs a provider decision (Stormglass or WorldTides) and an API key.

**Typecheck:** `npx tsc --noEmit` — zero errors as of last session.

---

## Tracks 2C.3 + 2A.2 — 2026-04-13 (parallel)

**2A.2 — Open-Meteo adapter:** Created `src/tools/forecast_sources/open_meteo.ts` with all fetch/parse logic (Zod schemas, unit converters, `ForecastPoint` assembly, `startIdx` sampling). Exports `fetchOpenMeteoData(lat, lon): Promise<MarineData | null>` and `openMeteoSource: ForecastSource`. `fetch_marine_data.ts` reduced to a thin wrapper delegating to `fetchOpenMeteoData` — public API unchanged so `route.ts` and `test_fetch.ts` need no changes. Moved `ForecastPoint` definition into `types.ts` to resolve a circular import that arose from `types.ts` previously re-importing it from `fetch_marine_data.ts`.

**2C.3 — Smart geocoding chain:** Rewrote `geocoding.ts`. `geocodeLocation` now implements the full three-step chain: (1) gazetteer O(n) name+alias match, case-insensitive; (2) Nominatim via `geocodeNominatim`; (3) Gemini HTTP call with a Nominatim cross-check using haversine distance — rejects if Nominatim disagrees by >5km, logs a warning and accepts if Nominatim has no result (obscure break not in OSM). Mismatches logged to console for future gazetteer growth.

**Typecheck:** `npx tsc --noEmit` — zero errors.

---

## Tracks 2C.2 + 2A.1 — 2026-04-13 (parallel)

**2A.1 — Forecast source interface:** Created `webapp/src/tools/forecast_sources/types.ts`. Defines `ForecastSource { name: string; fetch(lat, lon): Promise<ForecastPoint[] | null> }`. Re-exports `ForecastPoint` for adapters. Normalization rules documented inline (metres, km/h, seconds, meteorological degrees, null not zero). Unblocks 2A.2 (Open-Meteo adapter) and 2A.3 (NOAA WaveWatch III adapter).

**2C.2 — Nominatim adapter:** Created `webapp/src/tools/geocode_nominatim.ts`. `geocodeNominatim(query)` enforces 1-req/sec rate limit (module-level timestamp), sets descriptive `User-Agent` per OSM policy, caches results 24 h via `geocodeCache`. Zod-validates response array, rejects empty results and Null-Island. Returns `SpotCoordinates | null`. Ready to wire into the geocoding chain in Task 2C.3.

**Typecheck:** `npx tsc --noEmit` — zero errors.

---

## Tracks 2C + 2D — 2026-04-13 (parallel)

**2D.1 — In-memory LRU cache:** Created `webapp/src/lib/cache.ts`. Generic `LRUCache<T>` class using Map insertion order for LRU tracking, per-entry TTL. Two singletons: `forecastCache` (30-min TTL, 200 entries) and `geocodeCache` (24-h TTL, 500 entries). `withCache(cache, key, fn)` helper for cache-through. Wrapping the tools in `withCache` is Task 2D.2 (after forecast adapters exist).

**2C.1 — Gazetteer seed (partial):** Created `webapp/src/data/gazetteer.json` with 48 spots. Covers all spots listed in the task plan plus additions: Nazaré, Praia Grande, Costa da Caparica (Portugal), Lacanau (France), G-Land + Desert Point + Cloud Break (Indo/Pacific), Teahupoo, Chicama, Puerto Escondido, Margaret River, Fistral, Thurso East, Bundoran, Anchor Point (Morocco), J-Bay. All fields populated: `id`, `name`, `aliases`, `lat`, `lon`, `country`, `region`, `type`, `best_swell_dir_deg`, `best_wind_dir_deg`, `skill_min`, `notes`. Coordinate caveats and the swell-direction-wrapping issue documented in `findings.md`. **Dominik to verify Portugal/Algarve coordinates and add 2 more spots to hit 50.**

---

## Track 1D — 2026-04-13

**1D.1 — Remove fake tide box:** Replaced the `tide_trend` content with a "Tide data coming soon" italic placeholder. Removed `tide_trend` from the `AIStats` interface. Tide box kept in the grid so layout doesn't collapse.

**1D.2 — Null handling in data cards:** Updated all `RawData` fields to `number | null`. Added a `fmt(val, suffix)` helper that returns "—" for null values and a formatted string otherwise. Applied to every numeric field in the surfline-clone block (height, swell, wind, direction, temp) and the board bar.

**1D.3 — Error states:** Unified error rendering: API errors return `{ message: '...' }` in the persona voice (from 1C.3); network catch block now sets `message` instead of `error`. UI renders `response.message ?? response.error` with a new `error-state` CSS class (muted red). Loading spinner already covered the full request lifecycle.

**1D.4 — UX fixes:** Added a clear (×) button on the location input, shown when the field is non-empty, `tabIndex={-1}` to keep tab flow intact. Tab order correct by DOM order. Enter-to-submit already worked via standard form behaviour.

**Typecheck:** `npx tsc --noEmit` — zero errors.

**Phase 1 is now complete.** All tracks (1A–1D) done.

---

## Track 1B — 2026-04-13

**1B.1 — Fix current conditions bug:** Added `&current=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction` to the marine URL and `&current=wind_speed_10m,wind_direction_10m,temperature_2m` to the weather URL. The `current` ForecastPoint is now built from `marineData.current` / `weatherData.current` — the actual instantaneous reading — instead of `forecast_48h[0]` (which was local midnight, up to 24 h stale).

**1B.2 — Null-preserving logic:** Changed all `ForecastPoint` numeric fields to `number | null`. Converters (`mToFt`, `kmhToKnots`, `cToF`) now propagate null. Replaced every `|| 0` in the parse loop with `?? null` so missing data reaches the payload as `null`, not zero.

**1B.3 — Sampling starts from now:** Added a `startIdx` loop that finds the last hourly entry at or before `current.time` (lexicographic ISO-8601 comparison is correct since both strings share the same timezone offset from `timezone=auto`). The 3-hour sampling loop now begins at `startIdx` instead of 0.

**1B.4 — Zod validation for Open-Meteo:** Installed `zod`. Added `MarineApiResponseSchema` and `WeatherApiResponseSchema` covering both `current` and `hourly` blocks with nullable numerics. Both `.json()` calls are now wrapped in `ZodSchema.parse()`; a schema change from Open-Meteo throws a typed error logged with full Zod issue details.

**1B.5 — Harden geocoder:** Added `GeocodeResponseSchema` to `geocoding.ts` — validates lat ∈ [-90,90], lon ∈ [-180,180], rejects the `(0,0)` Null-Island fallback. Switched from manual `if (!data.latitude)` guard to `safeParse` so failures log exact Zod issues. Added a `TODO(2C.3)` pointer to the Nominatim cross-check planned for Phase 2.

**Typecheck:** `npx tsc --noEmit` — zero errors in Track 1B files. Two pre-existing errors remain in `route.ts` and `tests/test_route.ts` (Track 1C territory).

---

## Track 1C — 2026-04-13

**1C.1 — Zod request validation:** Added `ChatRequestSchema` (z.object) matching the gemini.md Input Schema. `POST` now returns 400 + `fieldErrors` on invalid input, and 400 on unparseable JSON. Installed `zod` as a prod dependency.

**1C.2 — Remove hallucinated `tide_trend`:** Deleted `tide_trend` from the Gemini JSON schema in the system prompt and from the `ai_stats` payload. Added an in-code comment pointing to Task 2B for the real tide API. Updated `findings.md` under "Violations caught and fixed".

**1C.3 — Typed errors + persona messages:** Replaced the catch-all `500 Internal Server Error` with four discriminated error codes (`GEOCODING_FAILED`, `FORECAST_FAILED`, `LLM_FAILED`, `UNKNOWN`). Each code has a persona-consistent surfer-voice message. Every early-return path now uses `errorResponse(code, status, traceId)`.

**1C.4 — Structured logging:** Created `webapp/src/lib/log.ts` with `logStep` and `logError` helpers. Both print a single JSON line to stdout/stderr with `traceId`, `step`, `label`, `duration_ms`, and optional `meta`. Replaced all `console.log("--> STEP N:")` calls in `route.ts`.

**1C.5 — In-memory rate limiting:** Created `webapp/src/lib/rate_limit.ts` — token-bucket keyed by IP, 20 req / 5-min window. On rejection returns 429 with `Retry-After` header. Every request now runs through `checkRateLimit(ip)` before validation.

**Side-effect fix:** `tests/test_route.ts` updated to use `NextRequest` (route handler signature changed from `Request` to `NextRequest` for IP extraction).

**Typecheck:** `npx tsc --noEmit` passes clean.

---

## Track 1A — 2026-04-13 (update)

**1A.1 (complete):** User rotated the Gemini API key. New key generated at Google AI Studio and placed in `.env.local`. Old key invalidated. Git history was clean (confirmed 2026-04-12 — key was never committed). Track 1A is now fully done.

## Track 1A — 2026-04-12

**1A.1 (verification only):** `git log --all -- webapp/.env.local` returned empty — key was never committed to git history. User should still consider rotating the key if it was shared or copied outside the repo. No action needed on the git side.

**1A.2:** Added `webapp/.env.example` listing `GEMINI_API_KEY=`. Fixed `webapp/.gitignore` to include `!.env.example` exception so the example file is committable while all real env files remain ignored.

**1A.3:** Replaced boilerplate `create-next-app` metadata in `webapp/src/app/layout.tsx` with real Surf Guru AI title, description, OG tags, `metadataBase`, and favicon reference.

**1A.4:** Rewrote `webapp/README.md` — real project description, local dev instructions, env var table, project structure, A.N.T. architecture summary, and links to `CLAUDE.md` / `gemini.md` / `task_plan.md`.

**1A.5:** Moved five test scripts (`test_fetch.ts`, `test_gemini.ts`, `test_geo.ts`, `test_geocoding.ts` from `src/tools/`; `test_route.ts` from `webapp/`) into `webapp/tests/` with updated relative imports. Deleted empty root-level `.tmp/` and `tools/` directories. Deleted empty root `.env`.

**1A.6:** Updated `progress.md` with this entry. `task_plan.md` is already the detailed phased version (rewritten 2026-04-11); no further changes needed.

---

## What was done, errors, tests, results
- Project initialized. Memory files generated.
- `gemini.md` updated with rigorous schemas.
- Set up Next.js `webapp` without Tailwind CSS.
- Completed Phase 2: Verified API connectivity for Open-Meteo & Gemini.
- Created Backend Tools (Layer 3): `geocoding.ts` and `fetch_marine_data.ts`.
- Built API Route `api/chat/route.ts` linking Layer 1, Layer 2, and Layer 3.
- Styled global CSS to a premium, dark, editorial Surf aesthetic.
- **Bug Fix 1 (Geocoding):** Open-Meteo Geocoding failed to find specific surf spots like "Pipeline".
  - *Resolution:* Replaced Open-Meteo geocoding with a dedicated Gemini-powered Geocoding Agent to accurately fetch coordinates for obscure surf spots globally.
- **Bug Fix 2 (Forecast Alignment):** Data was pulling from `hourly` index `0` instead of the realtime timezone.
  - *Resolution:* Refactored `fetch_marine_data.ts` to utilize the Open-Meteo `current` condition endpoint synced to the native `timezone=auto`.
- **Feature Add (Advanced Forecasting & Regional Knowledge):** User noted the forecast couldn't see "tomorrow" and requested specialized knowledge for Portugal (Sagres/Algarve).
  - *Resolution:* Upgraded `fetch_marine_data.ts` to retrieve a full 48-hour forecast separated by 3-hour increments. Upgraded the `route.ts` system prompt to feed this array to Gemini to allow it to accurately read the future like Surfline. Hardcoded instructions ensuring Gemini references 15-20 min driving radius substitutes specifically for the Portugal/Algarve region.
