# Findings

> **Purpose.** Non-obvious stuff a future session (yours or a parallel one) would otherwise re-learn the hard way. API quirks, "this looks wrong but isn't," competitor intel, debts we're carrying, and ideas we decided to defer. Organized **by topic**, not chronology. Append to the right section; don't delete entries — mark them `[resolved]` if they stop being true.

---

## Open-Meteo API reference

### Endpoints

**Marine forecast** — `https://marine-api.open-meteo.com/v1/marine`  
No authentication. Free for non-commercial use.

Parameters used:
- `latitude`, `longitude` (required)
- `current=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction`
- `hourly=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction`
- `timezone=auto`

**Weather forecast** — `https://api.open-meteo.com/v1/forecast`

Parameters used:
- `latitude`, `longitude` (required)
- `current=wind_speed_10m,wind_direction_10m,temperature_2m`
- `hourly=wind_speed_10m,wind_direction_10m,temperature_2m`
- `timezone=auto`

**Why two calls?** The marine endpoint does not reliably return wind. Never "optimize" by dropping the second call — it will silently remove all wind data.

**Error codes:** `400` = invalid coordinates or parameter format. `429` = rate limit hit (rare in dev).

### Open-Meteo quirks

### The "current conditions" trap [resolved]
**Symptom.** `fetchMarineData` treated `hourly[0]` as "current conditions."
**Reality.** With `timezone=auto`, Open-Meteo returns `hourly.time[0]` as **local midnight of today**, not "now." So your "current wave height" can be up to 24 hours stale.
**Fix applied (1B.1).** Added `&current=…` to both URLs. The API returns a `current` object with `{ time, interval, <fields> }` where `time` is actual wall-clock time in the spot's local timezone. We now build `current: ForecastPoint` from that object.
**Note.** `current.time` aligns to 15-minute intervals (Open-Meteo's native resolution). It is always ≤ now + 15 min.

### Sampling offset [resolved]
Same root cause: `for (let i = 0; i < times.length; i += 3)` started at index 0 (= midnight). Fixed in 1B.3: a `startIdx` search finds the last hourly entry at or before `current.time`. Lexicographic ISO-8601 comparison is safe because both strings share the same local timezone offset from `timezone=auto`.

### Missing data as zero [resolved]
`wave_height[i] || 0` silently rendered nulls as flat water. Fixed in 1B.2: all `ForecastPoint` numeric fields are now `number | null`; converters propagate null; `?? null` is used throughout.

### Models parameter
Open-Meteo supports `&models=gfs_wave025,ecmwf_wam025,ncep_gfs025,icon_seamless` on the marine endpoint. Use this to get a second independent forecast without paying for Stormglass. Relevant for Task 2A.3.

---

## compute_stats — deterministic surf stats

`webapp/src/tools/compute_stats.ts` derives all display stats from the raw `ForecastPoint` — no LLM needed for these. This makes the stats consistent, testable, and provider-agnostic, and lets the LLM focus purely on narrative text.

### What's computed deterministically
- `condition_rating` (POOR/FAIR/GOOD/EPIC) — swell height + period, degraded by strong wind (>35 kmh)
- `condition_color` — hardcoded hex per rating
- `surf_height_human` — wave height in human language (ankle high → double overhead+)
- `wind_trend` — compass direction label + strength (Light/Moderate/Fresh/Strong), e.g. "Moderate NW"
- `wetsuit_rec` — from `temp_c` thresholds
- `board_rec` — from wave height + skill level

### What's NOT computed here (still LLM)
- `forecast_report` — the full narrative markdown text. Gemini writes it as plain text; no JSON mode needed.
- Offshore/onshore wind classification — requires knowing the beach's facing direction, which we don't have deterministically. `wind_trend` reports the compass direction + strength instead; the LLM narrative interprets offshore-ness contextually.

### Threshold calibration needed
Starting thresholds are conservative and reasonable but untuned. **Dominik should validate against known Algarve sessions** — e.g., a "GOOD" Tonel day, a blown-out Sagres, a flat summer south coast day — and adjust the swell height/period/wind boundaries in `compute_stats.ts`. Thresholds are clearly grouped at the top of the file.

---

## Gemini API quirks

### JSON mode vs markdown-wrapped JSON
`responseMimeType: "application/json"` works well when set in `generationConfig`. Do **not** also tell Gemini to output ` ```json` blocks in the prompt — you'll get the raw JSON wrapped in markdown and have to strip it. We're clean on `route.ts` but `geocoding.ts:59` still has the defensive strip (harmless but unnecessary).

### Gemini as geocoder (current debt)
`geocodeLocation` uses Gemini to return `{ name, lat, lon }`. It works surprisingly well for well-known spots (Pipeline, Teahupoo, Supertubos) but has **limited verification**, so we've seen it:
- Return coordinates off by 5–20 km for Algarve spots
- Confidently geocode fictitious places

**Mitigation in place (1B.5).** `GeocodeResponseSchema` validates lat ∈ [-90,90], lon ∈ [-180,180] and rejects the `(0,0)` Null-Island fallback. Invalid results return `null` with a logged Zod error.

**Full fix plan.** Phase 2 adds (1) a hand-verified gazetteer as the primary source, (2) Nominatim fallback, (3) Gemini as last-resort with Nominatim cross-check. See Tasks 2C.1–2C.3.

### Gemini will happily invent tide data [resolved]
`route.ts` previously instructed Gemini to "use your local knowledge to estimate a realistic tide stage." This violates Rule #1 (no hallucinated forecasts). Removed `tide_trend` entirely from the output schema and payload (Task 1C.2, 2026-04-13). Real tide data scheduled for Phase 2B.

### Regional units via location string
The system prompt tells Gemini to infer the unit system from the location name. This mostly works but fails on ambiguous names (there's a "Pipeline" in Australia too). Better approach: derive the unit system from the returned coordinates server-side before composing the prompt. Deferred to Phase 2.

---

## Violations caught and fixed

- **Hallucinated tide times [resolved].** Rule #1 violation — `route.ts` system prompt instructed Gemini to estimate tide stage. Removed `tide_trend` from the Gemini output schema and from the API payload (Task 1C.2, 2026-04-13). Real tide data scheduled for Phase 2B via a dedicated API.
- **"Current" reading is actually midnight [resolved].** Violates implicit truthfulness of the `raw_data` block. Fixed in Task 1B.1 (2026-04-13) — switched to the Open-Meteo `current` object; `current.time` now matches real wall-clock time.

---

## Competitor intel (from Phase 0 research)

### Market structure (2026)
- **Surfline** is the market leader. ~$70/yr paywall locks the best data. Recently launched Premium+ with AI features: *Crowd Prediction*, *Wave Timeline* (scrub through 20-min windows), *Wave Distribution*, *Smart Clips*. They have 20+ years of human-observed session data for ML.
- **Magicseaweed** shut down May 2023, absorbed into Surfline. A large community of free-tier surfers is homeless.
- **Windy** is the best free alternative — great visualization, 3-model comparison, $4/mo. Not surf-specific.
- **BUIO** — personalized ML forecast from session journaling. You tag sessions ("glassy, peaky") and the app learns your preferences. Requires a lot of manual logging before it's useful.
- **SurfSense.ai** — "daily stoke score" + recommendations. Niche. Thin on substance, strong on framing.
- **Lazy Surfer / Wave Day / Surf Log / SurfTrackr** — session journals. Strong loggers, weak forecasters.
- **Swellinfo** — US East Coast favorite, unique multi-model ensemble comparison. Proves the ensemble angle works.
- **Gonna.surf** — Canary Islands hyperlocal, beats Surfline on topography. Proves the regional-topography angle.

### User pain points with Surfline (from reviews and forums)
- Paywall for basics: **units**, **swell energy**, best forecast data, camera access.
- **Coarse model** misses wave shadowing and topography (La Graciosa blocking La Santa, etc.).
- **Dense UI** — up to 8 separate wave numbers per slot; mixes horizontal and vertical layouts confusingly.
- **Slow during big swells** — exactly when you need it.
- **Geographic bias** — great for USA/AU, patchy for Europe and the rest.

### Our wedge (what's underserved)
1. **Free forever** on the core forecast (Surfline paywalls everything).
2. **Europe-first** coverage with hand-verified spots (Algarve, Ericeira, Peniche, France, Canary Islands).
3. **Topography-aware interpretation** via LLM reasoning on structured gazetteer notes (no CFD model needed).
4. **Multi-model ensemble + agreement score** (Swellinfo-style, but global).
5. **Natural-language AI surf guide** that actually reasons (not just a prompt with pasted JSON).
6. **Local-knowledge ingestion** — Reddit, Wannasurf, YouTube — nothing else does this.
7. **Personalized stoke score** after ≥5 sessions, like BUIO but without forcing manual logging first.

### Monetization reference
Surfline podcast interview (Paul Ganev): they don't spend on paid acquisition. Free tier is the growth funnel, subscription for committed users. Target conversion for good freemium apps: 3–5%. Excellent: 6–8%. Hard paywalls convert ~6× better but attract ~10× fewer users. We go freemium, with a Pro tier at maybe 3–5€/mo (undercuts Surfline ~6×) for alerts, region ranker, session history beyond 30 days, multi-spot compare.

---

## Forecast source normalization (planning notes for Phase 2)

Each forecast source returns its own shape. We'll normalize to `ForecastPoint[]`. The interface for all sources:

```ts
interface ForecastSource {
  name: string;  // "open-meteo-ecmwf", "open-meteo-gfs-wave", "stormglass", ...
  fetch(lat: number, lon: number): Promise<ForecastPoint[]>;
}
```

### Units to normalize
- Wave height: meters (provide `_ft` as derived)
- Wind: km/h (provide `knots` as derived)
- Period: seconds
- Direction: degrees (meteorological: 0° = from North)
- Temperature: °C (provide `°F` as derived)

### Time resolution
Normalize to 3-hour increments over 48h starting from "now", aligned to the nearest past 3h boundary so the first point is always ≤ now + 3h.

### Agreement score
`agreement(t) = 1 - clamp(stddev(sources_wave_height_at_t) / mean(sources_wave_height_at_t), 0, 1)`
- 1.0 = perfect agreement → high confidence
- < 0.5 = meaningful disagreement → show both and let the surfer decide

---

## Spot metadata sources

### Beach facing direction — OSM Overpass API (free, computational)
Beach facing direction (`facing_deg`) can be derived automatically from OpenStreetMap coastline geometry. Query the Overpass API for `natural=coastline` ways within ~500m of the spot coordinates, find the nearest segment, and compute its perpendicular. No scraping, no surf-site dependency.
- Endpoint: `https://overpass-api.de/api/interpreter`
- No auth required. Rate-limit to 1 req/s (usage policy).
- This is the key input for offshore/onshore wind classification in `compute_stats.ts` and the stoke score (Task 3B.1). Without it, wind direction is reported as a compass label only.
- Task: 2C.4

### Optimal swell/wind windows — Wannasurf + surf-forecast.com (one-off scrape)
Both sites have per-spot pages with structured optimal swell direction, optimal wind direction, and sometimes optimal tide stage. Scrape once at gazetteer-seed time and cache in `gazetteer.json`.
- Wannasurf: `https://www.wannasurf.com/spot/<slug>/` — has "optimal swell" and "optimal wind" fields in the spot sidebar.
- surf-forecast.com: `https://www.surf-forecast.com/breaks/<slug>/forecasts/latest/six_day` — spot info tab has direction windows.
- Respect `robots.txt` on both. Use a descriptive `User-Agent` (e.g. `SurfGuruAI/1.0 (non-commercial research)`).
- **Do not scrape Surfline** — their ToS explicitly prohibits it. Their data is also paywalled.
- For Algarve spots specifically, Dominik's ground-truth knowledge is more reliable than any scraped value. Use scraped values as a starting point, verify manually.
- Task: 2C.5

### What still needs human input (no source replaces this)
- `topography_notes` per spot — "wraps from WNW behind the headland, loses 30% of swell height" — this level of local knowledge is not structured anywhere online. Must be written by someone who has surfed the spot. Dominik owns the Algarve entries. Task: 3D.1.

---

## Gazetteer notes

### Coordinate accuracy
The 48-spot seed in `webapp/src/data/gazetteer.json` was compiled from known geography. Coordinates are accurate to ~0.01° for well-known WSL/CT spots (Pipeline, J-Bay, Supertubos, etc.) and ~0.1° for remote spots (Mentawais, G-Land). Error at 0.1° is ~10km — acceptable for calling the Open-Meteo grid but could put you on the wrong side of an island in the Mentawais. **Dominik should verify and correct all Algarve/Portugal entries** since he surfs there; the coords for Beliche, Telheiro, Castelejo, Tonel, etc. need field confirmation.

### Swell direction wrapping
`best_swell_dir_deg` is stored as `[min, max]` with min < max. This works for most spots but breaks for spots whose optimal window straddles 360°/0° (e.g. a spot needing 340–20° would need `[340, 20]`, which is illogical as a range). The current gazetteer avoids this by using `[315, 30]` as `[315, 360]` and capturing the wrap imprecisely. The stoke formula in Task 3B.1 should normalize to a circular comparison: `abs((actual - midpoint + 180) % 360 - 180) < window/2`.

### Spots flagged for coordinate verification
- Mentawais (Macaronis, Lance's Right) — remote, GPS-only territory, ±5km possible
- G-Land — SE Java tip, ±2km possible
- Thurso East — approximate river mouth position
- Cloud Break (Fiji) — ~1km W of Tavarua island, confirm via OSM

---

## Known debts (shortcuts we're carrying)

| # | Debt | Where | Cost if ignored | Scheduled fix | Status |
|---|---|---|---|---|---|
| 1 | "Current" reading was midnight-local | `fetch_marine_data.ts` | Stale "current" readings | 1B.1 | [resolved] |
| 2 | Tide data fabricated by LLM | `route.ts` | Rule #1 violation | 1C.2 + 2B | 1C.2 [resolved], 2B pending |
| 3 | Geocoder has no cross-check | `geocoding.ts` | Wrong coordinates → wrong forecast | 2C.3 | open |
| 4 | `\|\| 0` hid null forecast data | `fetch_marine_data.ts` | Shows flat ocean where data is missing | 1B.2 | [resolved] |
| 5 | No Zod validation | all tools | One API schema change crashes prod | 1B.4, 1C.1 | [resolved] |
| 6 | No caching | all tools | Expensive + slow + burns rate limits | 2D | open |
| 7 | No rate limiting on `/api/chat` | `route.ts` | $$$ abuse risk if deployed | 1C.5 | [resolved] |
| 8 | Test scripts in `src/tools/` | `webapp/src/tools/test_*.ts` | Pollutes build | 1A.5 | [resolved] |
| 9 | Default create-next-app metadata | `layout.tsx`, `README.md` | Unprofessional on share/embed | 1A.3, 1A.4 | [resolved] |
| 10 | Regional units via LLM inference | `route.ts` system prompt | Wrong units for ambiguous spot names | Phase 2 | open |
| 11 | No gitignore at project root | — | `.env` / `.DS_Store` at root could leak | 1A.2 | [resolved] |

---

## Parallel-session lessons (update as we learn)

- If two sessions ever need the same file, the second one should stop and surface it — don't try to merge blind.
- Small commits > big commits when parallel work is happening.

---

## Deferred / "do later" ideas (don't forget)

- **Wave shadowing model** — use NOAA bathymetry + simple ray tracing to compute *actual* effective swell at a spot given the raw offshore reading. Expensive to build, huge differentiator. Post-launch.
- **Crowd estimation from webcam frames** — OpenCV / a small vision model. Surfline's Premium+ has this; we could match it for free once the core product is solid.
- **Multilingual output** — PT, ES, FR, IT for European markets. Easy with Gemini's language support; deferred until we have traction.
- **Voice-first interface** — "hey Surf Guru, is Beliche firing?" — Whisper STT + TTS. Great demo, poor retention driver. Later.
- **Apple Watch complication** — real utility for surfers. Phase 6+.
- **Integration with Strava / GPS watches** for automatic session detection — removes all manual logging friction. Phase 6+.
- **Historical quality tracking** — "your top 10 days at Beliche" based on logged sessions. Low effort, high retention. Early Phase 4 bonus.
- **Wind-model disagreement layer on the map** — Swellinfo-style, but visual. Phase 5+.

---

## Glossary

- **Stoke score** — 0–100 rating of how good it'll be at a spot at a given time, personalized to the user's skill and history. Our signature output.
- **Model agreement** — 0–1 score of how much the multiple forecast sources agree. High agreement = confident prediction.
- **Gazetteer** — hand-verified JSON of surf spots with coordinates, type, best swell/wind direction, skill minimum, and topography notes. The backbone of our regional knowledge.
- **A.N.T.** — the 3-layer architecture (Architecture / Navigation / Tools): Layer 1 = LLM reasoning, Layer 2 = `route.ts` orchestration, Layer 3 = deterministic tools.
- **Topography-aware** — LLM reasoning over gazetteer `topography_notes` to interpret raw forecasts. Not a physics model.
