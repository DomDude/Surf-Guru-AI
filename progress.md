# Progress

> **Note (2026-04-11):** Project handbook was upgraded. A new `CLAUDE.md` now holds developer conventions and parallel-session protocol; `task_plan.md` was rewritten into phased parallel tracks (A/B/C/D/E); `findings.md` was populated with API quirks, competitor intel, and known debts. New sessions should start by reading `CLAUDE.md` → `gemini.md` → `task_plan.md` → `findings.md`. No code changes in this pass.

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
